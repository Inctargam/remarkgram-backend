import type { Mock } from 'vitest';
import { EventEmitter } from 'node:events';
import { RmqIntegrationEventPublisher } from './rmq-integration-event.publisher.js';

import { USER_ACCOUNTS_EXCHANGE } from '@app/message-broker';
import { createAvatarDeletionEvent } from '../../../users/application/integration-events/avatar-deletion-requested.event.js';

const event = createAvatarDeletionEvent(42, '11111111-1111-4111-8111-111111111111');

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('amqp-connection-manager', () => ({ connect: mocks.connect }));

type Send = (
  exchange: string,
  key: string,
  content: Buffer,
  options: {
    correlationId: string;
    messageId: string;
    mandatory: boolean;
    persistent: boolean;
    timeout: number;
  },
) => Promise<boolean | void>;
type TestChannel = EventEmitter & {
  publish: Mock<Send>;
  close: Mock<() => Promise<void>>;
};
type RawChannel = EventEmitter & { assertExchange: Mock<() => Promise<void>> };
type Setup = { confirm: boolean; setup: (channel: RawChannel) => Promise<void> };

describe('RmqIntegrationEventPublisher', () => {
  let raw: RawChannel;
  let channel: TestChannel;
  let connection: EventEmitter & {
    createChannel: Mock<(options: Setup) => TestChannel>;
    close: Mock<() => Promise<void>>;
  };
  let publisher: RmqIntegrationEventPublisher;
  const send = () => publisher.publish(event);

  beforeEach(() => {
    raw = Object.assign(new EventEmitter(), {
      assertExchange: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    channel = Object.assign(new EventEmitter(), {
      publish: vi.fn<Send>().mockResolvedValue(true),
      close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    connection = Object.assign(new EventEmitter(), {
      createChannel: vi.fn(({ setup }: Setup) => {
        void setup(raw);
        return channel;
      }),
      close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    mocks.connect.mockReturnValue(connection);
    publisher = new RmqIntegrationEventPublisher('amqp://localhost');
    publisher.onModuleInit();
  });
  afterEach(async () => {
    await publisher.onModuleDestroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('creates the channel on module init and reuses it for confirmed publications', async () => {
    expect(mocks.connect).toHaveBeenCalledExactlyOnceWith(['amqp://localhost'], {
      reconnectTimeInSeconds: 5,
    });
    expect(connection.createChannel).toHaveBeenCalledOnce();
    expect(channel.publish).not.toHaveBeenCalled();
    expect(raw.assertExchange).toHaveBeenCalledWith(USER_ACCOUNTS_EXCHANGE, 'topic', { durable: true });
    await send();
    expect(connection.createChannel).toHaveBeenCalledWith(expect.objectContaining({ confirm: true }));
    expect(channel.publish).toHaveBeenCalledWith(
      USER_ACCOUNTS_EXCHANGE,
      event.eventType,
      Buffer.from(JSON.stringify({ pattern: event.eventType, data: event })),
      expect.objectContaining({
        messageId: event.eventId,
        mandatory: true,
        persistent: true,
        timeout: 5_000,
      }),
    );
    await send();
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(connection.createChannel).toHaveBeenCalledOnce();
  });

  it.each([event, { ...event, eventType: 'users.profile-updated.v1', data: { userId: 42 } }])(
    'publishes $eventType with the event type as routing key and a Nest envelope',
    async (message) => {
      await publisher.publish(message);
      expect(channel.publish).toHaveBeenCalledExactlyOnceWith(
        USER_ACCOUNTS_EXCHANGE,
        message.eventType,
        Buffer.from(JSON.stringify({ pattern: message.eventType, data: message })),
        expect.objectContaining({ messageId: message.eventId }),
      );
    },
  );

  it('does not resolve before the broker confirms', async () => {
    let confirm!: () => void;
    channel.publish.mockReturnValue(
      new Promise<void>((resolve) => {
        confirm = resolve;
      }),
    );
    const completed = vi.fn();
    const result = send().then(completed);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    confirm();
    await result;
    expect(completed).toHaveBeenCalledOnce();
  });

  it('rejects a returned message even when the broker confirms it', async () => {
    channel.publish.mockImplementation((_exchange, _key, _content, options) => {
      raw.emit('return', {
        properties: options,
        fields: { exchange: 'events', routingKey: 'users.updated.v1' },
      });
      return Promise.resolve(true);
    });
    await expect(send()).rejects.toThrow('without a route');
  });

  it.each(['timeout', 'connection closed', 'nack'])(
    'propagates %s and allows a later attempt',
    async (error) => {
      channel.publish.mockRejectedValueOnce(new Error(error));
      await expect(send()).rejects.toThrow(error);
      await expect(send()).resolves.toBeUndefined();
    },
  );

  it('isolates concurrent attempts of the same event and ignores a late return', async () => {
    let firstConfirm!: () => void;
    let secondConfirm!: () => void;
    channel.publish
      .mockReturnValueOnce(
        new Promise<void>((r) => {
          firstConfirm = r;
        }),
      )
      .mockReturnValueOnce(
        new Promise<void>((r) => {
          secondConfirm = r;
        }),
      );
    const first = send();
    const second = send();
    const firstOptions = channel.publish.mock.calls[0][3];
    const secondOptions = channel.publish.mock.calls[1][3];
    expect(firstOptions.correlationId).not.toBe(secondOptions.correlationId);
    raw.emit('return', { properties: firstOptions, fields: { exchange: 'events', routingKey: 'x' } });
    const rejected = expect(first).rejects.toThrow('without a route');
    firstConfirm();
    await rejected;
    raw.emit('return', { properties: firstOptions, fields: { exchange: 'events', routingKey: 'x' } });
    secondConfirm();
    await expect(second).resolves.toBeUndefined();
  });

  it('installs return handling again after reconnect', async () => {
    await send();
    raw = Object.assign(new EventEmitter(), {
      assertExchange: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    await connection.createChannel.mock.calls[0][0].setup(raw);
    expect(raw.assertExchange).toHaveBeenCalledWith(USER_ACCOUNTS_EXCHANGE, 'topic', { durable: true });
    channel.publish.mockImplementation((_exchange, _key, _content, options) => {
      raw.emit('return', { properties: options, fields: { exchange: 'events', routingKey: 'x' } });
      return Promise.resolve(true);
    });
    await expect(send()).rejects.toThrow('without a route');
  });

  it('closes channel and connection and prevents new publications', async () => {
    await send();
    await publisher.onModuleDestroy();
    expect(channel.close).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
    await expect(send()).rejects.toThrow('closed');
  });
});
