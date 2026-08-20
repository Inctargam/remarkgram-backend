import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeletedPostsPublisherWorker } from './deleted-posts-publisher.worker.js';
import type { OutboxEventsRepository } from '../ports/outbox-events.repository.js';
import type { PostsEventsPublisher } from '../ports/posts-events.publisher.js';
import { OutboxStatus } from '../../domain/enums/outbox-event-status.enum.js';
import { randomUUID } from 'node:crypto';
import { POST_DELETED_V1_EVENT_NAME, type PostDeletedV1Event } from '@app/message-broker';
import type { ApplicationOutboxEvent } from '../types/outbox.types.js';
import { PostDeletedOutboxEventMapper } from './mappers/post-deleted-outbox-event.mapper.js';
const MAX_EVENTS_PER_POLL = 25;
const MAX_ATTEMPTS = 5;
const systemTime = new Date(2026, 7, 19);
const minutesToAdd = 2;
const postDeletedPayload: PostDeletedV1Event['data'] = {
  postId: 1,
  authorId: 1,
  deletedAt: new Date().toISOString(),
  fileIds: ['1', '2', '3'],
};
const outboxEvent: ApplicationOutboxEvent = {
  id: randomUUID(),
  eventType: POST_DELETED_V1_EVENT_NAME,
  aggregateType: 'post',
  aggregateId: '1',
  payload: postDeletedPayload,
  status: OutboxStatus.PENDING,
  attempts: 1,
  availableAt: new Date(systemTime.setMinutes(systemTime.getMinutes() + minutesToAdd)),
  createdAt: new Date(),
  publishedAt: null,
  lastError: null,
};

describe('Deleted posts publisher worker', () => {
  const mapperSpy = vi.spyOn(PostDeletedOutboxEventMapper, 'toIntegrationEvent');

  const outbox = {
    add: vi.fn<OutboxEventsRepository['add']>(),
    findClaimNextAvailableEvent: vi.fn<OutboxEventsRepository['findClaimNextAvailableEvent']>(),
    ensurePublished: vi.fn<OutboxEventsRepository['ensurePublished']>(),
    markExpiredExhaustedEventsDead: vi.fn<OutboxEventsRepository['markExpiredExhaustedEventsDead']>(),
  } satisfies OutboxEventsRepository;
  const publisher = {
    deletedPostEvent: vi.fn<PostsEventsPublisher['deletedPostEvent']>(),
  } satisfies PostsEventsPublisher;
  const worker = new DeletedPostsPublisherWorker(outbox, publisher);

  beforeAll(() => {
    // Замораживаем время на конкретной дате
    vi.useFakeTimers();
    vi.setSystemTime(systemTime);
  });
  beforeEach(() => {
    outbox.findClaimNextAvailableEvent.mockReset();
    outbox.ensurePublished.mockReset();
    outbox.markExpiredExhaustedEventsDead.mockReset();
    publisher.publishPostDeleted.mockReset();
    mapperSpy.mockReset();
  });

  it('publishes a claimed event and marks it as published', async () => {
    const integrationEvent: PostDeletedV1Event = {
      eventId: outboxEvent.id,
      eventType: POST_DELETED_V1_EVENT_NAME,
      aggregateType: outboxEvent.aggregateType,
      aggregateId: outboxEvent.aggregateId,
      data: postDeletedPayload,
    };

    outbox.findClaimNextAvailableEvent.mockResolvedValueOnce(outboxEvent).mockResolvedValueOnce(null);

    await worker.run();

    expect(mapperSpy).toHaveBeenCalledOnce();
    expect(mapperSpy).toHaveBeenCalledWith(outboxEvent);
    expect(mapperSpy).toHaveReturnedWith(integrationEvent);

    expect(publisher.publishPostDeleted).toHaveBeenCalledOnce();
    expect(publisher.publishPostDeleted).toHaveBeenCalledWith(integrationEvent);
    expect(outbox.ensurePublished).toHaveBeenCalledWith(integrationEvent.eventId);
    expect(outbox.markExpiredExhaustedEventsDead).toHaveBeenCalledOnce();

    expect(outbox.findClaimNextAvailableEvent).toHaveBeenCalledTimes(2);
  });

  it('does not publish an event if it is already published', async () => {
    outbox.findClaimNextAvailableEvent.mockResolvedValueOnce(null);

    await worker.run();

    expect(outbox.findClaimNextAvailableEvent).toHaveBeenCalledOnce();
    expect(mapperSpy).toHaveBeenCalledTimes(0);
    expect(publisher.publishPostDeleted).not.toHaveBeenCalledOnce();
    expect(outbox.ensurePublished).not.toHaveBeenCalledOnce();
    expect(outbox.markExpiredExhaustedEventsDead).toHaveBeenCalledTimes(1);
  });

  it('returns an error if the mapper receives an event of an invalid', async () => {
    outbox.findClaimNextAvailableEvent.mockResolvedValueOnce({
      ...outboxEvent,
      eventType: 'invalid-event-type',
    });

    await worker.run();
    expect(mapperSpy).toThrow(Error);
    expect(publisher.publishPostDeleted).not.toHaveBeenCalledOnce();
    expect(outbox.ensurePublished).not.toHaveBeenCalledOnce();
    expect(outbox.markExpiredExhaustedEventsDead).toHaveBeenCalledTimes(1);
  });

  it('does not mark the event as published if the broker returns an error', async () => {
    outbox.findClaimNextAvailableEvent.mockResolvedValueOnce(outboxEvent).mockResolvedValueOnce(null);
    publisher.publishPostDeleted.mockRejectedValueOnce(new Error('Failed to publish event'));
    await worker.run();
    expect(mapperSpy).toHaveBeenCalledOnce();
    expect(publisher.publishPostDeleted).toHaveBeenCalledOnce();
    expect(outbox.ensurePublished).not.toHaveBeenCalledOnce();

    expect(outbox.markExpiredExhaustedEventsDead).toHaveBeenCalledTimes(1);
    expect(outbox.findClaimNextAvailableEvent).toHaveBeenCalledTimes(2);
  });

  it('rescheduling an event with a limit of 5 attempts', async () => {
    let attempts = 0;

    outbox.findClaimNextAvailableEvent.mockImplementation(async () => {
      if (attempts >= MAX_ATTEMPTS) {
        return null;
      }

      attempts += 1;

      return {
        ...outboxEvent,
        attempts,
      };
    });

    await worker.run();
    await worker.run();
    await worker.run();
    await worker.run();
    await worker.run();
    await worker.run();

    expect(mapperSpy).toHaveBeenCalledTimes(5);
    expect(publisher.publishPostDeleted).toHaveBeenCalledTimes(5);
    expect(outbox.ensurePublished).toHaveBeenCalledTimes(5);
  });
  it('processes no more than 25 events per poll', async () => {
    outbox.findClaimNextAvailableEvent.mockImplementation(async () => {
      return {
        ...outboxEvent,
        attempts: 1,
      };
    });
    await worker.run();
    expect(mapperSpy).toHaveBeenCalledTimes(MAX_EVENTS_PER_POLL);
    expect(publisher.publishPostDeleted).toHaveBeenCalledTimes(MAX_EVENTS_PER_POLL);
    expect(outbox.ensurePublished).toHaveBeenCalledTimes(MAX_EVENTS_PER_POLL);
  });
  it('processes dose not break if ensurePublished throws an error ', async () => {
    outbox.findClaimNextAvailableEvent
      .mockResolvedValueOnce(outboxEvent)
      .mockResolvedValueOnce(outboxEvent)
      .mockResolvedValueOnce(null);

    outbox.ensurePublished.mockRejectedValueOnce(new Error('Failed to publish event')).mockResolvedValue();

    await worker.run();

    expect(mapperSpy).toHaveBeenCalledTimes(2);
    expect(publisher.publishPostDeleted).toHaveBeenCalledTimes(2);
    expect(outbox.ensurePublished).toHaveBeenCalledTimes(2);
    expect(outbox.markExpiredExhaustedEventsDead).toHaveBeenCalledTimes(1);
  });

  it('check the procedure for making a call', async () => {
    outbox.findClaimNextAvailableEvent.mockResolvedValueOnce(outboxEvent).mockResolvedValueOnce(null);
    await worker.run();

    expect(mapperSpy).toHaveBeenCalledOnce();
    expect(publisher.publishPostDeleted).toHaveBeenCalledOnce();
    expect(outbox.ensurePublished).toHaveBeenCalledOnce();
    expect(outbox.markExpiredExhaustedEventsDead).toHaveBeenCalledOnce();

    expect(outbox.findClaimNextAvailableEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mapperSpy.mock.invocationCallOrder[0],
    );
    expect(mapperSpy.mock.invocationCallOrder[0]).toBeLessThan(
      publisher.publishPostDeleted.mock.invocationCallOrder[0],
    );

    expect(publisher.publishPostDeleted.mock.invocationCallOrder[0]).toBeLessThan(
      outbox.ensurePublished.mock.invocationCallOrder[0],
    );
    expect(outbox.ensurePublished.mock.invocationCallOrder[0]).toBeLessThan(
      outbox.markExpiredExhaustedEventsDead.mock.invocationCallOrder[0],
    );
  });
});
