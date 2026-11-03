import {
  BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME,
  USER_ACCOUNTS_BUSINESS_ACCESS_QUEUE,
  type BusinessAccessChangedV1Event,
} from '@app/message-broker';
import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { ClientsModule, RmqRecordBuilder, Transport } from '@nestjs/microservices';
import { ClientProxyTransport, OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromPrisma, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { paymentsMessageBrokerConfig } from '../../../../config/message-broker.config.js';
import { PrismaModule } from '../../../../database/prisma.module.js';
import { PrismaService } from '../../../../database/prisma.service.js';
import { BusinessAccessEvents } from '../../application/ports/business-access-events.js';
import { NestBusinessAccessEventsAdapter } from './nest-business-access-events.adapter.js';

const BUSINESS_ACCESS_RMQ_CLIENT = 'BUSINESS_ACCESS_RMQ_CLIENT';

export const BusinessAccessRmqTransport = ClientProxyTransport(BUSINESS_ACCESS_RMQ_CLIENT, {
  toPacket: (message) => {
    const payload = message.payload as BusinessAccessChangedV1Event['data'];
    const event: BusinessAccessChangedV1Event = {
      eventId: message.id,
      eventType: BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME,
      aggregateType: 'user',
      aggregateId: String(payload.userId),
      data: payload,
    };

    return {
      pattern: event.eventType,
      data: new RmqRecordBuilder(event).setOptions({ persistent: true, messageId: event.eventId }).build(),
    };
  },
});

@Module({
  imports: [
    PrismaModule,
    OutboxModule.forRootAsync({
      imports: [
        ClientsModule.registerAsync([
          {
            name: BUSINESS_ACCESS_RMQ_CLIENT,
            imports: [ConfigModule.forFeature(paymentsMessageBrokerConfig)],
            inject: [paymentsMessageBrokerConfig.KEY],
            useFactory: (config: ConfigType<typeof paymentsMessageBrokerConfig>) => ({
              transport: Transport.RMQ,
              options: {
                urls: [config.url],
                queue: USER_ACCOUNTS_BUSINESS_ACCESS_QUEUE,
                queueOptions: { durable: true },
                persistent: true,
                // Клиент объявляет очередь; сообщения сохраняются и до подключения consumer.
                noAssert: false,
              },
            }),
          },
        ]),
      ],
      transports: { rabbitmq: BusinessAccessRmqTransport },
      useFactory: () => ({
        route: () => 'rabbitmq',
        relay: { pollInterval: '1s', lease: '30s', publishTimeout: '10s' },
        retry: { attempts: 10, backoff: { delay: '1s', factor: 2, maxDelay: '1m' } },
      }),
    }),
  ],
  providers: [
    {
      provide: PostgresOutboxStore,
      inject: [PrismaService, OutboxStorage],
      useFactory: (prisma: PrismaService, storage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromPrisma(prisma), migrate: false }, storage),
    },
    { provide: BusinessAccessEvents, useClass: NestBusinessAccessEventsAdapter },
  ],
  exports: [BusinessAccessEvents],
})
export class SubscriptionEventsModule {}
