import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { connect, type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, Message } from 'amqplib';

import { USER_ACCOUNTS_EXCHANGE, type IntegrationEvent } from '@app/message-broker';
import { IntegrationEventPublisher } from '../../application/ports/integration-event.publisher.js';

type Publication = { returned?: Error };

@Injectable()
export class RmqIntegrationEventPublisher
  implements IntegrationEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RmqIntegrationEventPublisher.name);
  private readonly pending = new Map<string, Publication>();
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private closed = false;

  constructor(private readonly url: string) {}

  onModuleInit(): void {
    this.connection = connect([this.url], { reconnectTimeInSeconds: 5 });
    this.connection.on('connectFailed', ({ err }: { err: unknown }) => {
      this.logger.error(`RabbitMQ connection failed: ${String(err)}`);
    });
    this.channel = this.connection.createChannel({
      confirm: true,
      setup: async (channel: ConfirmChannel) => {
        channel.on('return', (message: Message) => {
          const correlationId: unknown = message.properties.correlationId;
          const publication = typeof correlationId === 'string' ? this.pending.get(correlationId) : undefined;
          if (publication) {
            publication.returned = new Error(
              `RabbitMQ returned message without a route: ${message.fields.exchange}/${message.fields.routingKey}`,
            );
          }
        });
        await channel.assertExchange(USER_ACCOUNTS_EXCHANGE, 'topic', { durable: true });
      },
    });
    this.channel.on('error', (error: unknown) =>
      this.logger.error(`RabbitMQ channel failed: ${String(error)}`),
    );
  }

  async publish(event: IntegrationEvent): Promise<void> {
    if (this.closed) throw new Error('RabbitMQ publisher is closed');
    if (!this.channel) throw new Error('RabbitMQ publisher is not initialized');
    // eventId постоянный, а correlationId различает параллельные и запоздавшие попытки.
    const correlationId = randomUUID();
    const publication: Publication = {};
    this.pending.set(correlationId, publication);
    try {
      await this.channel.publish(
        USER_ACCOUNTS_EXCHANGE,
        event.eventType,
        Buffer.from(JSON.stringify({ pattern: event.eventType, data: event })),
        {
          messageId: event.eventId,
          correlationId,
          contentType: 'application/json',
          persistent: true,
          mandatory: true,
          timeout: 5_000,
        },
      );
      // RabbitMQ отправляет basic.return раньше confirm для сообщения без маршрута.
      if (publication.returned) throw publication.returned;
    } finally {
      this.pending.delete(correlationId);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.channel?.close();
    } finally {
      await this.connection?.close();
    }
  }
}
