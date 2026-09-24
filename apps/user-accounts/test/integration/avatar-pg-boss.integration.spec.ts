import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { PgBoss } from 'pg-boss';
import type { AvatarDeletionRequestedV1Event } from '@app/message-broker';
import { PrismaService } from '../../src/database/prisma.service.js';
import { createAvatarDeletionEvent } from '../../src/features/users/application/integration-events/avatar-deletion-requested.event.js';
import { PgBossAvatarDeletionOutbox } from '../../src/features/users/infrastructure/pg-boss/pg-boss-avatar-deletion.outbox.js';
import {
  AVATAR_DELETION_QUEUE,
  avatarDeletionBossOptions,
  avatarDeletionWorkOptions,
} from '../../src/features/users/infrastructure/pg-boss/avatar-deletion-queue.options.js';

const adminUrl = process.env.AVATAR_INTEGRATION_DATABASE_URL;
const exec = promisify(execFile);

describe.runIf(Boolean(adminUrl))('Avatar deletion queue on PostgreSQL', () => {
  const database = `avatar_queue_${randomUUID().replaceAll('-', '')}`;
  const productionWorkOptions = { ...avatarDeletionWorkOptions };
  let admin: Client;
  let url: string;
  let prisma: PrismaService;
  let boss: PgBoss;
  let queue: PgBossAvatarDeletionOutbox;
  const publisher = { publish: vi.fn<(event: AvatarDeletionRequestedV1Event) => Promise<void>>() };
  const jobs = () => boss.findJobs<AvatarDeletionRequestedV1Event>(AVATAR_DELETION_QUEUE);
  const enqueue = (event = createAvatarDeletionEvent(42, randomUUID())) =>
    prisma.$transaction(async (tx) => {
      await queue.enqueue(event, tx);
      return event;
    });

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    const connection = new URL(adminUrl!);
    connection.pathname = `/${database}`;
    url = connection.toString();
    prisma = new PrismaService({ url });
    // Короткий интервал только в этом изолированном тестовом процессе.
    avatarDeletionWorkOptions.pollingIntervalSeconds = 0.5;
    avatarDeletionWorkOptions.batchSize = 2;
  });

  beforeEach(async () => {
    publisher.publish.mockReset().mockResolvedValue(undefined);
    boss = new PgBoss({ ...avatarDeletionBossOptions, connectionString: url });
    queue = new PgBossAvatarDeletionOutbox(boss, publisher);
    await queue.start();
    await boss.updateQueue(AVATAR_DELETION_QUEUE, { retryLimit: 10, retryDelay: 0, expireInSeconds: 900 });
  });

  afterEach(async () => {
    await queue.stop();
    const cleaner = new PgBoss({ ...avatarDeletionBossOptions, connectionString: url, supervise: false });
    cleaner.on('error', () => {});
    try {
      await cleaner.start();
      await cleaner.deleteAllJobs(AVATAR_DELETION_QUEUE);
    } finally {
      await cleaner.stop();
    }
  });

  afterAll(async () => {
    Object.assign(avatarDeletionWorkOptions, productionWorkOptions);
    await prisma?.$disconnect();
    if (admin) {
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it('polls committed jobs without wake and drains multiple batches despite a failed job', async () => {
    await boss.updateQueue(AVATAR_DELETION_QUEUE, { retryDelay: 21600 });
    const events = Array.from({ length: 7 }, () => createAvatarDeletionEvent(42, randomUUID()));
    publisher.publish.mockImplementation((event) =>
      event.eventId === events[0].eventId
        ? Promise.reject(new Error('one failed message'))
        : Promise.resolve(),
    );
    await prisma.$transaction(async (tx) => {
      for (const event of events) await queue.enqueue(event, tx);
    });
    await vi.waitFor(
      async () => {
        const stored = await jobs();
        expect(stored.filter((job) => job.state === 'completed')).toHaveLength(6);
        expect(stored.find((job) => job.id === events[0].eventId)).toMatchObject({
          state: 'retry',
          output: { message: 'one failed message' },
        });
      },
      { timeout: 5000 },
    );
    expect(publisher.publish).toHaveBeenCalledTimes(7);
  });

  it('does not publish uncommitted or rolled-back jobs', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await queue.enqueue(createAvatarDeletionEvent(42, randomUUID()), tx);
        queue.wake();
        await new Promise((resolve) => setTimeout(resolve, 650));
        expect(publisher.publish).not.toHaveBeenCalled();
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await jobs()).toHaveLength(0);
  });

  it('coordinates two instances and settles only after the broker confirms', async () => {
    let confirm!: () => void;
    const waiting = new Promise<void>((resolve) => {
      confirm = resolve;
    });
    publisher.publish.mockReturnValueOnce(waiting);
    const first = await enqueue();
    queue.wake();
    await vi.waitFor(() => expect(publisher.publish).toHaveBeenCalledOnce());
    const second = await enqueue();
    const anotherBoss = new PgBoss({ ...avatarDeletionBossOptions, connectionString: url });
    const anotherQueue = new PgBossAvatarDeletionOutbox(anotherBoss, publisher);
    try {
      await anotherQueue.start();
      await vi.waitFor(async () => {
        const stored = await jobs();
        expect(stored.find((job) => job.id === first.eventId)?.state).toBe('active');
        expect(stored.find((job) => job.id === second.eventId)?.state).toBe('completed');
      });
      expect(publisher.publish.mock.calls.filter(([event]) => event.eventId === first.eventId)).toHaveLength(
        1,
      );
    } finally {
      confirm();
      await anotherQueue.stop();
    }
    await vi.waitFor(async () => expect((await jobs()).every((job) => job.state === 'completed')).toBe(true));
  });

  it('makes exactly ten retries, stores the error and manually retries the same message', async () => {
    publisher.publish.mockRejectedValue(new Error('broker unavailable'));
    const event = await enqueue();
    queue.wake();
    await vi.waitFor(
      async () => {
        expect((await jobs())[0]).toMatchObject({
          state: 'failed',
          retryCount: 10,
          output: { message: 'broker unavailable' },
        });
      },
      { timeout: 12000 },
    );
    expect(publisher.publish).toHaveBeenCalledTimes(11);
    publisher.publish.mockResolvedValue(undefined);
    await exec(process.execPath, ['apps/user-accounts/scripts/retry-avatar-deletion.mjs', event.eventId], {
      env: { ...process.env, DATABASE_URL: url },
    });
    await vi.waitFor(async () =>
      expect((await jobs())[0]).toMatchObject({ id: event.eventId, state: 'completed', data: event }),
    );
    expect(publisher.publish).toHaveBeenCalledTimes(12);
    await expect(
      exec(process.execPath, ['apps/user-accounts/scripts/retry-avatar-deletion.mjs', event.eventId], {
        env: { ...process.env, DATABASE_URL: url },
      }),
    ).rejects.toThrow('Failed job not found');
  }, 20000);

  it('does not overwrite a successful retry with a late failure from an expired worker', async () => {
    let rejectFirst!: (error: Error) => void;
    publisher.publish.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectFirst = reject;
      }),
    );
    const event = await enqueue();
    queue.wake();
    await vi.waitFor(() => expect(publisher.publish).toHaveBeenCalledOnce());
    const anotherBoss = new PgBoss({ ...avatarDeletionBossOptions, connectionString: url });
    const anotherQueue = new PgBossAvatarDeletionOutbox(anotherBoss, publisher);
    try {
      await prisma.$executeRaw`UPDATE pgboss.job SET started_on = now() - interval '1 hour' WHERE id = ${event.eventId}::uuid`;
      await prisma.$executeRaw`UPDATE pgboss.queue SET monitor_claim_on = NULL, monitor_on = NULL WHERE name = ${AVATAR_DELETION_QUEUE}`;
      await boss.supervise(AVATAR_DELETION_QUEUE);
      await anotherQueue.start();
      await vi.waitFor(async () => expect((await jobs())[0].state).toBe('completed'));
      rejectFirst(new Error('late broker failure'));
      await vi.waitFor(() => expect(boss.getWipData().every((worker) => worker.count === 0)).toBe(true));
      expect((await jobs())[0]).toMatchObject({ state: 'completed' });
      expect((await jobs())[0].output).not.toMatchObject({ message: 'late broker failure' });
      expect(publisher.publish).toHaveBeenCalledTimes(2);
    } finally {
      rejectFirst(new Error('test cleanup'));
      await anotherQueue.stop();
    }
  });

  it('recovers an abandoned active job without changing its message ID', async () => {
    await boss.offWork(AVATAR_DELETION_QUEUE, { wait: true });
    const event = await enqueue();
    const claimed = await boss.fetch(AVATAR_DELETION_QUEUE);
    expect(claimed).toHaveLength(1);
    // Моделируем истёкший claim после падения: временем управляем только в тестовой БД.
    await prisma.$executeRaw`UPDATE pgboss.job SET started_on = now() - interval '1 hour' WHERE id = ${event.eventId}::uuid`;
    await prisma.$executeRaw`UPDATE pgboss.queue SET monitor_claim_on = NULL, monitor_on = NULL WHERE name = ${AVATAR_DELETION_QUEUE}`;
    await boss.supervise(AVATAR_DELETION_QUEUE);
    expect((await jobs())[0].state).toBe('retry');
    await queue.stop();
    boss = new PgBoss({ ...avatarDeletionBossOptions, connectionString: url });
    queue = new PgBossAvatarDeletionOutbox(boss, publisher);
    await queue.start();
    await vi.waitFor(async () =>
      expect((await jobs())[0]).toMatchObject({ id: event.eventId, state: 'completed', data: event }),
    );
    expect(publisher.publish).toHaveBeenCalledExactlyOnceWith(event);
  });
});
