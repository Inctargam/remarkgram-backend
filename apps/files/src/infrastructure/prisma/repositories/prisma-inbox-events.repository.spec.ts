import { Prisma } from '../generated/client.js';
import type { PrismaService } from '../prisma.service.js';
import { InboxEventIdCollisionError } from '../../../application/errors/inbox-event-id-collision.error.js';
import { InboxEventStatus } from '../../../domain/enums/inbox-event-status.enum.js';
import { PrismaInboxEventsRepository } from './prisma-inbox-events.repository.js';

describe('PrismaInboxEventsRepository', () => {
  const create = vi.fn();
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const prisma = {
    inboxEvents: { create, findUnique, updateMany },
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
});

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
  });
}
