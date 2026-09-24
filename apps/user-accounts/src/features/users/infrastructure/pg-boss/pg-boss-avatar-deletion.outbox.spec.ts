import type { PgBoss, Job } from 'pg-boss';
import type { AvatarDeletionRequestedV1Event } from '@app/message-broker';
import { createAvatarDeletionEvent } from '../../application/integration-events/avatar-deletion-requested.event.js';
import { PgBossAvatarDeletionOutbox } from './pg-boss-avatar-deletion.outbox.js';
import {
  AVATAR_DELETION_QUEUE,
  avatarDeletionBossOptions,
  avatarDeletionQueueOptions,
  avatarDeletionWorkOptions,
} from './avatar-deletion-queue.options.js';

describe('PgBossAvatarDeletionOutbox', () => {
  const boss = {
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    createQueue: vi.fn(),
    work: vi.fn(),
    send: vi.fn(),
    notifyWorker: vi.fn(),
  };
  const publisher = { publish: vi.fn<(event: AvatarDeletionRequestedV1Event) => Promise<void>>() };
  const queue = new PgBossAvatarDeletionOutbox(boss as unknown as PgBoss, publisher);
  beforeEach(() => {
    vi.clearAllMocks();
    boss.work.mockResolvedValue('worker-id');
  });

  it('uses six-hour polling, drains full batches and keeps independent results', async () => {
    await queue.start();
    expect(boss.createQueue).toHaveBeenCalledWith(
      AVATAR_DELETION_QUEUE,
      expect.objectContaining({
        retryLimit: 10,
        retryDelay: 21600,
        expireInSeconds: 900,
        retentionSeconds: 2592000,
        deleteAfterSeconds: 2592000,
      }),
    );
    expect(boss.work).toHaveBeenCalledWith(
      AVATAR_DELETION_QUEUE,
      {
        batchSize: 100,
        localConcurrency: 1,
        pollingIntervalSeconds: 21600,
        burstWhenBatchFull: true,
        perJobResults: true,
      },
      expect.any(Function),
    );
    expect(avatarDeletionBossOptions).toMatchObject({
      max: 2,
      schedule: false,
      useListenNotify: false,
      superviseIntervalSeconds: 21600,
      monitorIntervalSeconds: 21600,
      queueCacheIntervalSeconds: 21600,
      flowIntervalSeconds: 21600,
      maintenanceIntervalSeconds: 86400,
    });
    expect(avatarDeletionQueueOptions.retryBackoff).toBe(false);
    expect(avatarDeletionWorkOptions.localConcurrency).toBe(1);
  });

  it('inserts using the caller transaction and preserves the message ID', async () => {
    const tx = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 'test' }]) };
    const event = createAvatarDeletionEvent(42, 'file-id');
    boss.send.mockImplementationOnce(
      async (
        _name,
        _event,
        options: { db: { executeSql: (text: string, values: unknown[]) => Promise<unknown> } },
      ) => {
        await options.db.executeSql('SELECT $1', [event.eventId]);
      },
    );
    await queue.enqueue(event, tx);
    expect(boss.send).toHaveBeenCalledWith(
      AVATAR_DELETION_QUEUE,
      event,
      expect.objectContaining({ id: event.eventId }),
    );
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith('SELECT $1', event.eventId);
    expect(boss.notifyWorker).not.toHaveBeenCalled();
  });

  it('wakes the local worker synchronously without publishing itself', async () => {
    await queue.start();
    queue.wake();
    expect(boss.notifyWorker).toHaveBeenCalledExactlyOnceWith('worker-id');
    expect(publisher.publish).not.toHaveBeenCalled();
    await queue.stop();
    queue.wake();
    expect(boss.notifyWorker).toHaveBeenCalledTimes(1);
    expect(boss.stop).toHaveBeenCalledOnce();
  });

  it('waits for confirms, records failures and continues sequentially', async () => {
    await queue.start();
    const events = Array.from({ length: 3 }, () => createAvatarDeletionEvent(42, 'file-id'));
    let confirm!: () => void;
    publisher.publish
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          confirm = resolve;
        }),
      )
      .mockRejectedValueOnce(new Error('broker offline'))
      .mockResolvedValueOnce(undefined);
    const handler = boss.work.mock.calls[0][2] as (
      jobs: Job<AvatarDeletionRequestedV1Event>[],
    ) => Promise<unknown>;
    const result = handler(
      events.map((event) => ({ id: event.eventId, data: event }) as Job<AvatarDeletionRequestedV1Event>),
    );
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    confirm();
    await expect(result).resolves.toEqual([
      { id: events[0].eventId, status: 'completed' },
      { id: events[1].eventId, status: 'failed', output: { message: 'broker offline' } },
      { id: events[2].eventId, status: 'completed' },
    ]);
    expect(publisher.publish.mock.calls.map(([event]) => event)).toEqual(events);
  });
});
