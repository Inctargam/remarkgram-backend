import { afterAll, beforeAll, beforeEach, describe, expect, vi } from 'vitest';
import { PrismaOutboxEventsRepository } from './prisma-outbox-events.repository.js';
import { PrismaService } from '../prisma.service.js';
import { randomUUID } from 'node:crypto';
import { POST_DELETED_V1_EVENT_NAME, PostDeletedV1Event } from '@app/message-broker';
import { OutboxStatus } from '../generated/enums.js';

describe('PrismaOutboxEventsRepository', () => {
  const prisma = {
    outboxEvent: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };

  const repository = new PrismaOutboxEventsRepository(prisma as unknown as PrismaService);

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T10:00:00.000Z'));
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    // prisma.$queryRaw.mockReset();
    // prisma.outboxEvent.create.mockReset();
    // prisma.$executeRaw.mockReset();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('adds an integration event to the outbox', async () => {
    const event: PostDeletedV1Event = {
      eventId: randomUUID(),
      eventType: POST_DELETED_V1_EVENT_NAME,
      aggregateType: 'post',
      aggregateId: '42',
      data: {
        postId: 42,
        authorId: 10,
        fileIds: ['file-1'],
        deletedAt: '2026-08-20T10:00:00.000Z',
      },
    };
    prisma.outboxEvent.create.mockResolvedValueOnce({});

    await repository.add(event);

    expect(prisma.outboxEvent.create).toHaveBeenCalledOnce();

    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        id: event.eventId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.data,
      },
    });
  });

  it('claims an available batch and recovers exhausted events in the same query', async () => {
    vi.setSystemTime(new Date('2026-08-20T10:03:00.000Z'));
    const claimedRow = {
      id: randomUUID(),
      eventType: POST_DELETED_V1_EVENT_NAME,
      aggregateType: 'post',
      aggregateId: '42',
      payload: {
        postId: 42,
        authorId: 10,
        fileIds: ['file-1'],
        deletedAt: '2026-08-20T10:00:00.000Z',
      },
      status: OutboxStatus.PENDING,
      attempts: 1,
      availableAt: new Date('2026-08-20T10:02:00.000Z'),
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      publishedAt: null,
      lastError: null,
    };
    const max_attempts = 5;

    prisma.$queryRaw.mockResolvedValueOnce([claimedRow]);

    const eventRecords = await repository.findAvailableBatch(
      POST_DELETED_V1_EVENT_NAME,
      max_attempts,
      100,
    );
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(eventRecords).toEqual([claimedRow]);

    const executeRawCall = prisma.$queryRaw.mock.calls[0];
    expect(executeRawCall).toContain(OutboxStatus.PENDING);
    expect(executeRawCall).toContain(OutboxStatus.DEAD);
    expect(executeRawCall).toContain(POST_DELETED_V1_EVENT_NAME);
    expect(executeRawCall).toContain(max_attempts);
    expect(executeRawCall).toContain(100);
  });

  it('returns null when no event is available', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const eventRecord = await repository.findAvailableBatch(POST_DELETED_V1_EVENT_NAME, 5, 100);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(eventRecord).toBeNull();
  });

  it('propagates a database error', async () => {
    const dataBaseError = new Error('Database error');
    prisma.$queryRaw.mockRejectedValueOnce(dataBaseError);
    await expect(repository.findAvailableBatch(POST_DELETED_V1_EVENT_NAME, 5, 100)).rejects.toThrow();
  });

  it('completes successfully when no row needs to be updated', async () => {
    prisma.$executeRaw.mockResolvedValueOnce(0);
    const eventId = randomUUID();
    await expect(repository.ensurePublished(eventId)).resolves.toBeUndefined();

    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    const executeRawCall = prisma.$executeRaw.mock.calls[0];

    expect(executeRawCall).toContain(OutboxStatus.PUBLISHED);
    expect(executeRawCall).toContain(eventId);
  });

});
