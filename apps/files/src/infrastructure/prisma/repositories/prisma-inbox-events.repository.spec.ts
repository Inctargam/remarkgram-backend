import { Prisma } from '../generated/client.js';
import type { PrismaService } from '../prisma.service.js';
import { InboxEventIdCollisionError } from '../../../application/errors/inbox-event-id-collision.error.js';
import { InboxEventStatus } from '../../../domain/enums/inbox-event-status.enum.js';
import { PrismaInboxEventsRepository } from './prisma-inbox-events.repository.js';

describe('PrismaInboxEventsRepository', () => {
  const create = vi.fn();
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const queryRaw = vi.fn();
  const executeRaw = vi.fn();
  const prisma = {
    inboxEvents: { create, findUnique, updateMany },
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
  };
  const repository = new PrismaInboxEventsRepository(prisma as unknown as PrismaService);
  const event = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'posts.post-deleted.v1',
    payload: {
      postId: 42,
      userId: 7,
      fileIds: ['22222222-2222-4222-8222-222222222222'],
      deletedAt: '2026-08-21T12:00:00.000Z',
    },
  };

  beforeEach(() => vi.clearAllMocks());

  it('reports that a new inbox event was created', async () => {
    create.mockResolvedValue({ eventId: event.eventId });

    await expect(repository.add(event)).resolves.toEqual({ eventId: event.eventId, created: true });
  });

  it('accepts an identical event-id replay idempotently', async () => {
    create.mockRejectedValue(uniqueConstraintError());
    findUnique.mockResolvedValue({
      eventId: event.eventId,
      eventType: event.eventType,
      payload: event.payload,
    });

    await expect(repository.add(event)).resolves.toEqual({ eventId: event.eventId, created: false });
  });

  it('rejects an event-id replay with a different payload', async () => {
    create.mockRejectedValue(uniqueConstraintError());
    findUnique.mockResolvedValue({
      eventId: event.eventId,
      eventType: event.eventType,
      payload: { ...event.payload, postId: 43 },
    });

    await expect(repository.add(event)).rejects.toBeInstanceOf(InboxEventIdCollisionError);
  });

  it('rejects an event-id replay with a different event type', async () => {
    create.mockRejectedValue(uniqueConstraintError());
    findUnique.mockResolvedValue({
      eventId: event.eventId,
      eventType: 'posts.post-updated.v1',
      payload: event.payload,
    });

    await expect(repository.add(event)).rejects.toBeInstanceOf(InboxEventIdCollisionError);
  });

  it('rethrows the unique constraint error when the conflicting record cannot be loaded', async () => {
    const error = uniqueConstraintError();
    create.mockRejectedValue(error);
    findUnique.mockResolvedValue(null);

    await expect(repository.add(event)).rejects.toBe(error);
  });

  it('does not hide an unexpected persistence error', async () => {
    const error = new Error('Database unavailable');
    create.mockRejectedValue(error);

    await expect(repository.add(event)).rejects.toBe(error);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('claims and maps available inbox events', async () => {
    const receivedAt = new Date('2026-08-21T12:00:00.000Z');
    const availableAt = new Date('2026-08-21T12:02:00.000Z');
    queryRaw.mockResolvedValue([
      {
        event_id: event.eventId,
        event_type: event.eventType,
        payload: event.payload,
        status: InboxEventStatus.RECEIVED,
        attempts: 2,
        received_at: receivedAt,
        processed_at: null,
        available_at: availableAt,
        last_error: 'Previous attempt failed',
      },
    ]);

    await expect(
      repository.findAvailableBatch({ eventType: event.eventType, batchSize: 25, maxAttempts: 5 }),
    ).resolves.toEqual([
      {
        eventId: event.eventId,
        eventType: event.eventType,
        payload: event.payload,
        status: InboxEventStatus.RECEIVED,
        attempts: 2,
        receivedAt,
        processedAt: null,
        availableAt,
        lastError: 'Previous attempt failed',
      },
    ]);
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it.each([[], null])('returns null when no inbox events were claimed: %j', async (result) => {
    queryRaw.mockResolvedValue(result);

    await expect(
      repository.findAvailableBatch({ eventType: event.eventType, batchSize: 25, maxAttempts: 5 }),
    ).resolves.toBeNull();
  });

  it('maps a legacy inbox payload without file IDs to an empty array', async () => {
    queryRaw.mockResolvedValue([
      {
        event_id: event.eventId,
        event_type: event.eventType,
        payload: {
          postId: event.payload.postId,
          userId: event.payload.userId,
          deletedAt: event.payload.deletedAt,
        },
        status: InboxEventStatus.RECEIVED,
        attempts: 1,
        received_at: new Date('2026-08-21T12:00:00.000Z'),
        processed_at: null,
        available_at: new Date('2026-08-21T12:02:00.000Z'),
        last_error: null,
      },
    ]);

    const result = await repository.findAvailableBatch({
      eventType: event.eventType,
      batchSize: 25,
      maxAttempts: 5,
    });

    expect(result?.[0]?.payload.fileIds).toEqual([]);
  });

  it('marks an event processed only for the current lease owner', async () => {
    const leaseUntil = new Date('2026-08-21T12:02:00.000Z');
    const processedAt = new Date('2026-08-21T12:01:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(processedAt);
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(repository.markAsProcessed(event.eventId, leaseUntil)).resolves.toBe(true);
    await expect(repository.markAsProcessed(event.eventId, leaseUntil)).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        eventId: event.eventId,
        availableAt: leaseUntil,
        status: InboxEventStatus.RECEIVED,
      },
      data: {
        lastError: null,
        processedAt,
        status: InboxEventStatus.PROCESSED,
      },
    });
    vi.useRealTimers();
  });

  it('marks an event as processed through the supplied transaction client', async () => {
    const transactionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transactionClient = { inboxEvents: { updateMany: transactionUpdateMany } };
    const leaseUntil = new Date('2026-08-21T12:02:00.000Z');

    await expect(repository.markAsProcessed(event.eventId, leaseUntil, transactionClient)).resolves.toBe(
      true,
    );

    expect(transactionUpdateMany).toHaveBeenCalledOnce();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('reports whether a failed attempt was resolved by the current lease owner', async () => {
    const leaseUntil = new Date('2026-08-21T12:02:00.000Z');
    executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(
      repository.resolveFailedAttempt(event.eventId, leaseUntil, 'Processing failed', 5),
    ).resolves.toBe(true);
    await expect(
      repository.resolveFailedAttempt(event.eventId, leaseUntil, 'Processing failed', 5),
    ).resolves.toBe(false);

    expect(executeRaw).toHaveBeenCalledTimes(2);
  });
});

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
  });
}
