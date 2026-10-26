import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import type { IntegrationEvent } from '@app/message-broker';
import { PrismaService } from '../../src/database/prisma.service.js';
import { PrismaUnitOfWork } from '../../src/database/prisma-unit-of-work.js';
import { createAvatarDeletionEvent } from '../../src/features/users/application/integration-events/avatar-deletion-requested.event.js';
import { PrismaOutboxEventsRepository } from '../../src/features/outbox/infrastructure/persistence/repositories/prisma-outbox-events.repository.js';
import { OutboxWorker } from '../../src/features/outbox/application/workers/outbox.worker.js';

const adminUrl = process.env.AVATAR_INTEGRATION_DATABASE_URL;

describe.runIf(Boolean(adminUrl))('User-accounts outbox on PostgreSQL', () => {
  const database = `avatar_outbox_${randomUUID().replaceAll('-', '')}`;
  let admin: Client;
  let prisma: PrismaService;
  let repository: PrismaOutboxEventsRepository;
  let worker: OutboxWorker;
  let url: string;
  const publisher = { publish: vi.fn<(event: IntegrationEvent) => Promise<void>>() };
  const enqueue = async () => {
    const event = createAvatarDeletionEvent(42, randomUUID());
    await prisma.$transaction((tx) => repository.add(event, tx));
    return event;
  };

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    const connection = new URL(adminUrl!);
    connection.pathname = `/${database}`;
    url = connection.toString();
    const setup = new Client({ connectionString: url });
    await setup.connect();
    try {
      await setup.query(
        await readFile(
          'apps/user-accounts/prisma/migrations/20260925120000_avatar_deletion_outbox/migration.sql',
          'utf8',
        ),
      );
    } finally {
      await setup.end();
    }
    prisma = new PrismaService({ url });
    repository = new PrismaOutboxEventsRepository(prisma);
    worker = new OutboxWorker(new PrismaUnitOfWork(prisma), repository, publisher);
  });
  beforeEach(async () => {
    publisher.publish.mockReset().mockResolvedValue(undefined);
    await prisma.outboxEvent.deleteMany();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    if (admin) {
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it('stores and publishes different event types through the same outbox', async () => {
    const avatar = createAvatarDeletionEvent(42, randomUUID());
    const profile: IntegrationEvent = {
      eventId: randomUUID(),
      eventType: 'users.profile-updated.v1',
      aggregateType: 'user',
      aggregateId: '42',
      data: { userId: 42, fields: ['firstName', 'city'], profile: { firstName: 'Alice', city: null } },
    };
    await prisma.$transaction(async (tx) => {
      await repository.add(avatar, tx);
      await repository.add(profile, tx);
    });
    await worker.run();
    expect(publisher.publish).toHaveBeenCalledWith(avatar);
    expect(publisher.publish).toHaveBeenCalledWith(profile);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: { not: null } } })).toBe(2);
  });

  it('drains multiple pages with equal timestamps once per pass, despite failed messages', async () => {
    const events = Array.from({ length: 205 }, () => createAvatarDeletionEvent(42, randomUUID()));
    const createdAt = new Date('2026-01-01T00:00:00Z');
    await prisma.outboxEvent.createMany({
      data: events.map((event) => ({
        id: event.eventId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.data,
        createdAt,
      })),
    });
    const failed = events[0];
    publisher.publish.mockImplementation((event) =>
      event.eventId === failed.eventId ? Promise.reject(new Error('offline')) : Promise.resolve(),
    );
    await worker.run();
    expect(publisher.publish).toHaveBeenCalledTimes(205);
    expect(new Set(publisher.publish.mock.calls.map(([event]) => event.eventId)).size).toBe(205);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(1);
    expect(await prisma.outboxEvent.findUnique({ where: { id: failed.eventId } })).toMatchObject({
      lastError: 'Error: offline',
      publishedAt: null,
    });
    publisher.publish.mockResolvedValue(undefined);
    await worker.run();
    expect(publisher.publish).toHaveBeenCalledTimes(206);
    expect(await prisma.outboxEvent.findUnique({ where: { id: failed.eventId } })).toMatchObject({
      lastError: null,
      publishedAt: expect.any(Date) as Date,
    });
  }, 20_000);

  it('does not publish uncommitted or rolled-back events', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const event = createAvatarDeletionEvent(42, randomUUID());
        await repository.add(event, tx);
        await worker.publish(event.eventId);
        await worker.run();
        expect(publisher.publish).not.toHaveBeenCalled();
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await prisma.outboxEvent.count()).toBe(0);
  });

  it('skips a row held by another worker and only marks it published after confirmation', async () => {
    let confirm!: () => void;
    publisher.publish.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        confirm = resolve;
      }),
    );
    const first = await enqueue();
    const sending = worker.publish(first.eventId);
    await vi.waitFor(() => expect(publisher.publish).toHaveBeenCalledOnce());
    const second = await enqueue();
    const anotherPrisma = new PrismaService({ url });
    const anotherWorker = new OutboxWorker(
      new PrismaUnitOfWork(anotherPrisma),
      new PrismaOutboxEventsRepository(anotherPrisma),
      publisher,
    );
    try {
      await anotherWorker.run();
      expect(await prisma.outboxEvent.findUnique({ where: { id: first.eventId } })).toMatchObject({
        publishedAt: null,
      });
      expect(await prisma.outboxEvent.findUnique({ where: { id: second.eventId } })).toMatchObject({
        publishedAt: expect.any(Date) as Date,
      });
      expect(publisher.publish.mock.calls.filter(([event]) => event.eventId === first.eventId)).toHaveLength(
        1,
      );
    } finally {
      confirm();
      await sending;
      await anotherPrisma.$disconnect();
    }
    await worker.publish(first.eventId);
    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });

  it('preserves the ID after lost confirmation and retries beyond ten failures', async () => {
    const event = await enqueue();
    publisher.publish.mockRejectedValue(new Error('confirmation lost'));
    for (let attempt = 0; attempt < 12; attempt++) await worker.run();
    expect(publisher.publish).toHaveBeenCalledTimes(12);
    publisher.publish.mockResolvedValue(undefined);
    await worker.run();
    expect(publisher.publish.mock.calls.every(([sent]) => sent.eventId === event.eventId)).toBe(true);
    expect(await prisma.outboxEvent.findUnique({ where: { id: event.eventId } })).toMatchObject({
      publishedAt: expect.any(Date) as Date,
      lastError: null,
    });
  });

  it('retries after a failed database commit with the same event ID', async () => {
    const event = await enqueue();
    const failedCommit = new OutboxWorker(
      {
        run: (handler, options) =>
          prisma.$transaction(async (tx) => {
            await handler(tx);
            throw new Error('commit failed');
          }, options),
      },
      repository,
      publisher,
    );
    await failedCommit.publish(event.eventId);
    expect(await prisma.outboxEvent.findUnique({ where: { id: event.eventId } })).toMatchObject({
      publishedAt: null,
    });
    await worker.run();
    expect(publisher.publish.mock.calls.map(([sent]) => sent.eventId)).toEqual([
      event.eventId,
      event.eventId,
    ]);
  });

  it('cannot overwrite a successful retry with a late failure from an expired transaction', async () => {
    const event = await enqueue();
    let rejectFirst!: (error: Error) => void;
    publisher.publish.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectFirst = reject;
      }),
    );
    const shortTransaction = new OutboxWorker(
      {
        run: (handler) => prisma.$transaction((tx) => handler(tx), { timeout: 100 }),
      },
      repository,
      publisher,
    );
    const recordFailure = vi.spyOn(repository, 'recordFailure');
    const sending = shortTransaction.publish(event.eventId);
    try {
      await vi.waitFor(() => expect(publisher.publish).toHaveBeenCalledOnce());
      // После истечения транзакции другой worker получает строку, хотя первый callback ещё ждёт брокера.
      await vi.waitFor(async () => {
        await worker.publish(event.eventId);
        expect(
          (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.eventId } })).publishedAt,
        ).not.toBeNull();
      });
      rejectFirst(new Error('late broker failure'));
      await sending;
      expect(recordFailure).toHaveBeenCalledOnce();
      await expect(recordFailure.mock.results[0].value).rejects.toThrow();
      expect(await prisma.outboxEvent.findUnique({ where: { id: event.eventId } })).toMatchObject({
        publishedAt: expect.any(Date) as Date,
        lastError: null,
      });
    } finally {
      rejectFirst?.(new Error('test cleanup'));
      recordFailure.mockRestore();
      await sending;
    }
  });

  it('recovers a lock abandoned by a terminated database session', async () => {
    const event = await enqueue();
    const abandoned = new Client({ connectionString: url });
    abandoned.on('error', () => {});
    await abandoned.connect();
    try {
      await abandoned.query('BEGIN');
      await abandoned.query('SELECT id FROM outbox_events WHERE id=$1 FOR UPDATE', [event.eventId]);
      const pid = (await abandoned.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await worker.run();
      expect(publisher.publish).not.toHaveBeenCalled();
      await admin.query('SELECT pg_terminate_backend($1)', [pid]);
      await worker.run();
      expect(publisher.publish).toHaveBeenCalledExactlyOnceWith(event);
    } finally {
      await abandoned.end();
    }
  });

  it('uses a fixed upper bound and retains pending rows during history cleanup', async () => {
    const pending = await enqueue();
    const published = await enqueue();
    const recent = await enqueue();
    const future = await enqueue();
    const oldDate = new Date('2020-01-01T00:00:00Z');
    await prisma.outboxEvent.update({
      where: { id: pending.eventId },
      data: { createdAt: oldDate, lastError: 'offline' },
    });
    await prisma.outboxEvent.update({ where: { id: published.eventId }, data: { publishedAt: oldDate } });
    await prisma.outboxEvent.update({ where: { id: recent.eventId }, data: { publishedAt: new Date() } });
    await prisma.outboxEvent.update({
      where: { id: future.eventId },
      data: { createdAt: new Date('2100-01-01T00:00:00Z') },
    });
    expect(await repository.findPending(new Date())).toEqual([{ id: pending.eventId, createdAt: oldDate }]);
    await repository.deletePublishedBefore(new Date(Date.now() - 30 * 86400_000));
    expect(await prisma.outboxEvent.findUnique({ where: { id: published.eventId } })).toBeNull();
    expect(await prisma.outboxEvent.count()).toBe(3);
  });
});
