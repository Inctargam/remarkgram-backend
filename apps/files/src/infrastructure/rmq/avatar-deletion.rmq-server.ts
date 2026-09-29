import { ServerRMQ } from '@nestjs/microservices';
import type { Channel } from 'amqplib';
import {
  AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
  FILES_AVATAR_DELETION_EXCHANGE,
  FILES_AVATAR_DELETION_QUEUE,
  USER_ACCOUNTS_EXCHANGE,
} from '@app/message-broker';

const DEAD_QUEUE = 'files_avatar_deletion_dead_queue';

export class AvatarDeletionRmqServer extends ServerRMQ {
  constructor(
    url: string,
    private readonly retryDelayMs = 60_000,
  ) {
    super({
      urls: [url],
      queue: FILES_AVATAR_DELETION_QUEUE,
      noAssert: true, // Очередь с аргументами объявляется ниже, перед запуском consumer.
      noAck: false,
      prefetchCount: 1,
    });
  }

  override async setupChannel(channel: Channel, callback: () => void): Promise<void> {
    // Nest вызывает этот метод при подключении и после переподключения.
    await channel.assertExchange(USER_ACCOUNTS_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(FILES_AVATAR_DELETION_EXCHANGE, 'direct', { durable: true });

    // DLQ и её маршрут должны существовать до начала обработки основной очереди.
    await channel.assertQueue(DEAD_QUEUE, {
      durable: true,
      arguments: { 'x-queue-type': 'quorum' },
    });
    await channel.bindQueue(DEAD_QUEUE, FILES_AVATAR_DELETION_EXCHANGE, 'dead');

    await channel.assertQueue(FILES_AVATAR_DELETION_QUEUE, {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        // RabbitMQ 4.3+: первая попытка и до трёх повторов с минутной задержкой.
        'x-delivery-limit': 3,
        'x-delayed-retry-type': 'failed',
        'x-delayed-retry-min': this.retryDelayMs,
        'x-delayed-retry-max': this.retryDelayMs,
        'x-dead-letter-exchange': FILES_AVATAR_DELETION_EXCHANGE,
        'x-dead-letter-routing-key': 'dead',
        // Брокер хранит сообщение, пока DLQ не подтвердит приём.
        'x-dead-letter-strategy': 'at-least-once',
        'x-overflow': 'reject-publish',
      },
    });
    await channel.bindQueue(
      FILES_AVATAR_DELETION_QUEUE,
      USER_ACCOUNTS_EXCHANGE,
      AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
    );
    // Ручной повтор из DLQ направляется только в Files, без рассылки другим подписчикам.
    await channel.bindQueue(FILES_AVATAR_DELETION_QUEUE, FILES_AVATAR_DELETION_EXCHANGE, 'main');

    await super.setupChannel(channel, callback);
  }
}
