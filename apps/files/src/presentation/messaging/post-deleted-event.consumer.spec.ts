import { POST_DELETED_V1_EVENT_NAME } from '@app/message-broker';
import type { RmqContext } from '@nestjs/microservices';
import { InboxEventIdCollisionError } from '../../application/errors/inbox-event-id-collision.error.js';
import type { InboxEventsRepository } from '../../application/ports/inbox-events.repository.js';
import type { PostDeletedInboxWorker } from '../../application/workers/post-deleted-inbox.worker.js';
import { PostDeletedEventConsumer } from './post-deleted-event.consumer.js';

describe('PostDeletedEventConsumer', () => {
  const event = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: POST_DELETED_V1_EVENT_NAME,
    aggregateType: 'post',
    aggregateId: '42',
    data: {
      postId: 42,
      authorId: 7,
      fileIds: ['22222222-2222-4222-8222-222222222222'],
      deletedAt: '2026-08-21T12:00:00.000Z',
    },
  };
  const message = {};
  const channel = { ack: vi.fn(), nack: vi.fn() };
  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  } as unknown as RmqContext;
  const inbox = { add: vi.fn() };
  const worker = { run: vi.fn() };
  const consumer = new PostDeletedEventConsumer(
    inbox as unknown as InboxEventsRepository,
    worker as unknown as PostDeletedInboxWorker,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    inbox.add.mockResolvedValue({ eventId: event.eventId, created: true });
    worker.run.mockResolvedValue(undefined);
  });

  it('persists a valid event before acknowledging the broker message', async () => {
    await consumer.handle(event, context);

    expect(inbox.add).toHaveBeenCalledWith({
      eventId: event.eventId,
      eventType: POST_DELETED_V1_EVENT_NAME,
      payload: {
        postId: 42,
        userId: 7,
        fileIds: event.data.fileIds,
        deletedAt: event.data.deletedAt,
      },
    });
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(inbox.add.mock.invocationCallOrder[0]).toBeLessThan(channel.ack.mock.invocationCallOrder[0]);
    expect(worker.run).toHaveBeenCalledOnce();
  });

  it('rejects an invalid message without requeueing it', async () => {
    await consumer.handle({ ...event, eventId: 'invalid' }, context);

    expect(inbox.add).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
  });

  it('does not requeue a permanent event-id collision', async () => {
    inbox.add.mockRejectedValue(new InboxEventIdCollisionError(event.eventId));

    await consumer.handle(event, context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(worker.run).not.toHaveBeenCalled();
  });

  it('requeues a transient inbox persistence error', async () => {
    inbox.add.mockRejectedValue(new Error('Database unavailable'));

    await consumer.handle(event, context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    expect(worker.run).not.toHaveBeenCalled();
  });
});
