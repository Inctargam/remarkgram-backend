import { RmqContext } from '@nestjs/microservices';
import { AVATAR_DELETION_REQUESTED_V1_EVENT_NAME } from '@app/message-broker';
import { AvatarDeletionEventConsumer } from './avatar-deletion-event.consumer.js';
import { ImageUploadStateConflictError } from '../../application/errors/image-upload.errors.js';

const event = {
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  eventType: AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
  data: { userId: 42, fileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
};
describe('AvatarDeletionEventConsumer', () => {
  const deletion = { execute: vi.fn() };
  const worker = { run: vi.fn() };
  const channel = { ack: vi.fn(), reject: vi.fn() };
  const message = {};
  const context = new RmqContext([message, channel, event.eventType]);
  const consumer = new AvatarDeletionEventConsumer(deletion as never, worker as never);
  beforeEach(() => {
    vi.resetAllMocks();
    worker.run.mockResolvedValue(undefined);
  });
  it('acknowledges only after persistence, then starts the physical deletion worker', async () => {
    let complete!: () => void;
    deletion.execute.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const processing = consumer.handle(event, context);
    expect(channel.ack).not.toHaveBeenCalled();
    complete();
    await processing;
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(worker.run).toHaveBeenCalledOnce();
    expect(channel.ack.mock.invocationCallOrder[0]).toBeLessThan(worker.run.mock.invocationCallOrder[0]);
    await consumer.handle(event, context);
    expect(channel.ack).toHaveBeenCalledTimes(2);
  });
  it('accepts queued messages from the previous version with extra aggregate fields', async () => {
    await consumer.handle({ ...event, aggregateType: 'User', aggregateId: '42' }, context);
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.reject).not.toHaveBeenCalled();
    expect(deletion.execute).toHaveBeenCalledOnce();
  });
  it('returns transient failures to the quorum queue without acknowledging them', async () => {
    deletion.execute.mockRejectedValue(new Error('DB unavailable'));
    await consumer.handle(event, context);
    expect(channel.reject).toHaveBeenCalledWith(message, true);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(worker.run).not.toHaveBeenCalled();
  });
  it('sends a state conflict straight to DLQ', async () => {
    deletion.execute.mockRejectedValue(new ImageUploadStateConflictError());
    await consumer.handle(event, context);
    expect(channel.reject).toHaveBeenCalledWith(message, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { ...event, eventId: 'bad' },
    { ...event, eventType: 'unexpected.event' },
    { ...event, data: { userId: 0, fileId: event.data.fileId } },
    { ...event, data: { userId: 42, fileId: 'bad' } },
  ])('rejects malformed input %j', async (data) => {
    await consumer.handle(data, context);
    expect(channel.reject).toHaveBeenCalledWith(message, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(deletion.execute).not.toHaveBeenCalled();
  });
  it('does not requeue a persisted request if the background worker fails', async () => {
    worker.run.mockRejectedValue(new Error('S3 offline'));
    await consumer.handle(event, context);
    expect(channel.ack).toHaveBeenCalledOnce();
    expect(channel.reject).not.toHaveBeenCalled();
  });
});
