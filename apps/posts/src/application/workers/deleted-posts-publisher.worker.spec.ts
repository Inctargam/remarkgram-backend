import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeletedPostsPublisherWorker } from './deleted-posts-publisher.worker.js';
import type { OutboxEventsRepository } from '../ports/outbox-events.repository.js';
import type { PostsEventsPublisher } from '../ports/posts-events.publisher.js';
import { OutboxStatus } from '../../domain/enums/outbox-event-status.enum.js';
import { randomUUID } from 'node:crypto';
import { POST_DELETED_V1_EVENT_NAME, type PostDeletedV1Event } from '@app/message-broker';
import type { ApplicationOutboxEvent } from '../types/outbox.types.js';
import { PostDeletedOutboxEventMapper } from './mappers/post-deleted-outbox-event.mapper.js';

const BATCH_SIZE = 100;
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
    findAvailableBatch: vi.fn<OutboxEventsRepository['findAvailableBatch']>(),
    ensurePublished: vi.fn<OutboxEventsRepository['ensurePublished']>(),
    resolveFailedAttempt: vi.fn<OutboxEventsRepository['resolveFailedAttempt']>(),
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
    outbox.findAvailableBatch.mockReset();
    outbox.ensurePublished.mockReset();
    publisher.deletedPostEvent.mockReset();
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

    outbox.findAvailableBatch.mockResolvedValueOnce([outboxEvent]);

    await worker.run();

    expect(mapperSpy).toHaveBeenCalledOnce();
    expect(mapperSpy).toHaveBeenCalledWith(outboxEvent);
    expect(mapperSpy).toHaveReturnedWith(integrationEvent);

    expect(publisher.deletedPostEvent).toHaveBeenCalledOnce();
    expect(publisher.deletedPostEvent).toHaveBeenCalledWith(integrationEvent);
    expect(outbox.ensurePublished).toHaveBeenCalledWith(integrationEvent.eventId);

    expect(outbox.findAvailableBatch).toHaveBeenCalledTimes(1);
    expect(outbox.findAvailableBatch).toHaveBeenCalledWith(
      POST_DELETED_V1_EVENT_NAME,
      MAX_ATTEMPTS,
      BATCH_SIZE,
    );
  });

  it('does not publish an event if it is already published', async () => {
    outbox.findAvailableBatch.mockResolvedValueOnce(null);

    await worker.run();

    expect(outbox.findAvailableBatch).toHaveBeenCalledOnce();
    expect(mapperSpy).toHaveBeenCalledTimes(0);
    expect(publisher.deletedPostEvent).not.toHaveBeenCalledOnce();
    expect(outbox.ensurePublished).not.toHaveBeenCalledOnce();
  });

  it('returns an error if the mapper receives an event type of an invalid', async () => {
    outbox.findAvailableBatch.mockImplementation(async () => {
      return [
        {
          ...outboxEvent,
          eventType: 'invalid-event-type',
        },
      ];
    });

    await worker.run();
    expect(mapperSpy).toThrow(Error);
    expect(publisher.deletedPostEvent).not.toHaveBeenCalledOnce();
    expect(outbox.ensurePublished).not.toHaveBeenCalledOnce();
  });

  it('does not mark the event as published if the broker returns an error', async () => {
    outbox.findAvailableBatch.mockResolvedValueOnce([outboxEvent]);
    publisher.deletedPostEvent.mockRejectedValueOnce(new Error('Failed to publish event'));
    await worker.run();
    expect(mapperSpy).toHaveBeenCalledOnce();
    expect(publisher.deletedPostEvent).toHaveBeenCalledOnce();
    expect(outbox.ensurePublished).not.toHaveBeenCalledOnce();

    expect(outbox.findAvailableBatch).toHaveBeenCalledTimes(1);
  });

  it('rescheduling an event with a limit of 5 attempts', async () => {
    let attempts = 0;

    outbox.findAvailableBatch.mockImplementation(async () => {
      if (attempts >= MAX_ATTEMPTS) {
        return null;
      }

      attempts += 1;

      return [
        {
          ...outboxEvent,
          attempts,
        },
      ];
    });

    await worker.run();
    await worker.run();
    await worker.run();
    await worker.run();
    await worker.run();
    await worker.run();

    expect(mapperSpy).toHaveBeenCalledTimes(5);
    expect(publisher.deletedPostEvent).toHaveBeenCalledTimes(5);
    expect(outbox.ensurePublished).toHaveBeenCalledTimes(5);
  });

  it('processes dose not break if ensurePublished throws an error ', async () => {
    outbox.findAvailableBatch.mockResolvedValue([outboxEvent]);

    outbox.ensurePublished.mockRejectedValueOnce(new Error('Failed to publish event')).mockResolvedValue();

    await worker.run();

    expect(mapperSpy).toHaveBeenCalledTimes(1);
    expect(publisher.deletedPostEvent).toHaveBeenCalledTimes(1);
    expect(outbox.ensurePublished).toHaveBeenCalledTimes(1);
  });

  it('check the procedure for making a call', async () => {
    outbox.findAvailableBatch.mockResolvedValueOnce([outboxEvent]);

    await worker.run();

    expect(mapperSpy).toHaveBeenCalledOnce();
    expect(publisher.deletedPostEvent).toHaveBeenCalledOnce();
    expect(outbox.ensurePublished).toHaveBeenCalledOnce();

    expect(outbox.findAvailableBatch.mock.invocationCallOrder[0]).toBeLessThan(
      mapperSpy.mock.invocationCallOrder[0],
    );
    expect(mapperSpy.mock.invocationCallOrder[0]).toBeLessThan(
      publisher.deletedPostEvent.mock.invocationCallOrder[0],
    );

    expect(publisher.deletedPostEvent.mock.invocationCallOrder[0]).toBeLessThan(
      outbox.ensurePublished.mock.invocationCallOrder[0],
    );
  });

  it('republishes and marks an event when the first worker loses its lease', async () => {
    let finishFirstPublish!: () => void;
    const firstPublishPending = new Promise<void>((resolve) => {
      finishFirstPublish = resolve;
    });

    outbox.findAvailableBatch.mockResolvedValueOnce([outboxEvent]).mockResolvedValueOnce([
      {
        ...outboxEvent,
        availableAt: new Date(systemTime.getTime() + 10 * 60_000),
      },
    ]);
    console.log('finishFirstPublish', finishFirstPublish);
    // Первый worker зависает во время отправки в брокер.
    publisher.deletedPostEvent
      .mockImplementationOnce(async () => firstPublishPending)
      // Второй worker отправляет сообщение сразу.
      .mockResolvedValueOnce(undefined);

    // Запускам выполнение
    const firstRun = worker.run();
    await vi.waitFor(() => {
      expect(publisher.deletedPostEvent).toHaveBeenCalledTimes(1);
    });

    const secondRun = worker.run();

    await vi.waitFor(() => {
      expect(publisher.deletedPostEvent).toHaveBeenCalledTimes(2);
      expect(outbox.ensurePublished).toHaveBeenCalledTimes(1);
    });
    // Второй worker уже опубликовал и отметил событие,
    // пока первый всё ещё обрабатывает его.

    expect(outbox.ensurePublished).toHaveBeenCalledWith(outboxEvent.id);

    //После выполнения промежуточных проверок тест разрешает первому worker-у продолжить
    finishFirstPublish();

    //Ожидает полного завершения обоих запусков
    await Promise.all([firstRun, secondRun]);

    expect(publisher.deletedPostEvent).toHaveBeenCalledTimes(2);
    expect(outbox.ensurePublished).toHaveBeenCalledTimes(2);
    expect(outbox.ensurePublished).toHaveBeenNthCalledWith(1, outboxEvent.id);
    expect(outbox.ensurePublished).toHaveBeenNthCalledWith(2, outboxEvent.id);
  });
});
