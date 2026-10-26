import { ServerRMQ } from '@nestjs/microservices';
import type { Channel } from 'amqplib';
import { FILES_AVATAR_DELETION_QUEUE } from '@app/message-broker';
import { AvatarDeletionRmqServer } from './avatar-deletion.rmq-server.js';

describe('AvatarDeletionRmqServer', () => {
  const channel = {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue: vi.fn().mockResolvedValue(undefined),
    bindQueue: vi.fn().mockResolvedValue(undefined),
  };
  const server = new AvatarDeletionRmqServer('amqp://localhost');

  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => vi.clearAllMocks());

  it('declares the complete topology before starting the Nest consumer', async () => {
    const startConsumer = vi.spyOn(ServerRMQ.prototype, 'setupChannel').mockResolvedValue(undefined);
    await server.setupChannel(channel as unknown as Channel, vi.fn());

    expect(channel.assertQueue).toHaveBeenCalledWith(
      FILES_AVATAR_DELETION_QUEUE,
      expect.objectContaining({
        arguments: expect.objectContaining({
          'x-delivery-limit': 3,
          'x-delayed-retry-min': 60_000,
          'x-delayed-retry-max': 60_000,
          'x-dead-letter-strategy': 'at-least-once',
        }) as unknown,
      }),
    );
    expect(channel.bindQueue).toHaveBeenCalledTimes(3);
    expect(startConsumer.mock.invocationCallOrder[0]).toBeGreaterThan(
      channel.bindQueue.mock.invocationCallOrder.at(-1)!,
    );
  });

  it('does not start consuming if declaring topology fails', async () => {
    const startConsumer = vi.spyOn(ServerRMQ.prototype, 'setupChannel').mockResolvedValue(undefined);
    channel.assertQueue.mockRejectedValueOnce(new Error('PRECONDITION_FAILED'));

    await expect(server.setupChannel(channel as unknown as Channel, vi.fn())).rejects.toThrow(
      'PRECONDITION_FAILED',
    );
    expect(startConsumer).not.toHaveBeenCalled();
  });
});
