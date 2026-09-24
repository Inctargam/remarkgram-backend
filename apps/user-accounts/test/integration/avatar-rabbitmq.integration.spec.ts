import { Client } from 'pg';
import { PgBoss } from 'pg-boss';
import { PrismaService } from '../../src/database/prisma.service.js';
import { PgBossAvatarDeletionOutbox } from '../../src/features/users/infrastructure/pg-boss/pg-boss-avatar-deletion.outbox.js';
import { avatarDeletionBossOptions } from '../../src/features/users/infrastructure/pg-boss/avatar-deletion-queue.options.js';
import { randomUUID } from 'node:crypto';
import type { INestMicroservice } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClientProxyFactory, Transport, type ClientProxy } from '@nestjs/microservices';
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { createAvatarDeletionEvent } from '../../src/features/users/application/integration-events/avatar-deletion-requested.event.js';
import { RmqAvatarDeletionPublisher } from '../../src/features/users/infrastructure/rmq/rmq-avatar-deletion.publisher.js';
import { AvatarDeletionEventConsumer } from '../../../files/src/presentation/messaging/avatar-deletion-event.consumer.js';
import { ScheduleAttachedFileDeletionUseCase } from '../../../files/src/application/use-cases/schedule-attached-file-deletion/schedule-attached-file-deletion.use-case.js';
import { FileDeletionJobsWorker } from '../../../files/src/application/workers/file-deletion-jobs.worker.js';

const url = process.env.AVATAR_RABBITMQ_TEST_URL;

// Настоящий транспорт и production consumer. Транзакции use case отдельно проверяет PostgreSQL suite.
describe.runIf(Boolean(url))('Avatar deletion over RabbitMQ', () => {
  const queue = `avatar_test_${randomUUID()}`;
  const event = createAvatarDeletionEvent(42, randomUUID());
  const deletion = { execute: vi.fn() };
  const worker = { run: vi.fn().mockResolvedValue(undefined) };
  let client: ClientProxy;
  let publisher: RmqAvatarDeletionPublisher;
  let monitor: ChannelWrapper;
  let service: INestMicroservice | undefined;
  let admin: Client | undefined;
  let prisma: PrismaService | undefined;
  let avatarDeletionOutbox: PgBossAvatarDeletionOutbox | undefined;
  const databaseName = `avatar_rabbit_${randomUUID().replaceAll('-', '')}`;

  async function startConsumer() {
    const module = await Test.createTestingModule({
      controllers: [AvatarDeletionEventConsumer],
      providers: [
        { provide: ScheduleAttachedFileDeletionUseCase, useValue: deletion },
        { provide: FileDeletionJobsWorker, useValue: worker },
      ],
    }).compile();
    service = module.createNestMicroservice(
      {
        transport: Transport.RMQ,
        options: { urls: [url!], queue, queueOptions: { durable: true }, noAck: false, prefetchCount: 1 },
      },
      { logger: false },
    );
    await service.listen();
  }

  beforeAll(async () => {
    client = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: [url!],
        queue,
        queueOptions: { durable: true },
        persistent: true,
      },
    });
    publisher = new RmqAvatarDeletionPublisher(client);
    await client.connect();
    monitor = client.unwrap<AmqpConnectionManager>().createChannel();
    await monitor.waitForConnect();
    if (process.env.AVATAR_INTEGRATION_DATABASE_URL) {
      admin = new Client({ connectionString: process.env.AVATAR_INTEGRATION_DATABASE_URL });
      await admin.connect();
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      const databaseUrl = new URL(process.env.AVATAR_INTEGRATION_DATABASE_URL);
      databaseUrl.pathname = `/${databaseName}`;
      prisma = new PrismaService({ url: databaseUrl.toString() });
      avatarDeletionOutbox = new PgBossAvatarDeletionOutbox(
        new PgBoss({ ...avatarDeletionBossOptions, connectionString: databaseUrl.toString() }),
        publisher,
      );
      await avatarDeletionOutbox.start();
    }
  }, 20_000);

  afterAll(async () => {
    await avatarDeletionOutbox?.stop();
    await prisma?.$disconnect();
    if (admin) {
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      await admin.end();
    }
    await service?.close();
    if (monitor) {
      await monitor.deleteQueue(queue);
      await monitor.close();
    }
    if (client) await client.close();
  });

  it('declares a durable queue before a consumer exists, confirms publication, then handles redelivery', async () => {
    if (avatarDeletionOutbox && prisma) {
      const durableQueue = avatarDeletionOutbox;
      await prisma.$transaction((tx) => durableQueue.enqueue(event, tx));
      durableQueue.wake();
    } else {
      await publisher.publish(event);
    }
    await vi.waitFor(async () =>
      expect(await monitor.checkQueue(queue)).toMatchObject({ messageCount: 1, consumerCount: 0 }),
    );

    deletion.execute.mockReturnValueOnce(new Promise<void>(() => {}));
    await startConsumer();
    await vi.waitFor(() => expect(deletion.execute).toHaveBeenCalledTimes(1));
    expect(worker.run).not.toHaveBeenCalled();

    // Потеря consumer до commit/ack должна вернуть сообщение следующему экземпляру.
    await service!.close();
    service = undefined;
    deletion.execute.mockResolvedValue(undefined);
    await startConsumer();
    await vi.waitFor(() => expect(worker.run).toHaveBeenCalledTimes(1));
    expect(deletion.execute).toHaveBeenCalledTimes(2);
    await publisher.publish(event);
    await vi.waitFor(() => expect(deletion.execute).toHaveBeenCalledTimes(3));
    expect(
      deletion.execute.mock.calls.every(
        ([command]: [{ params: unknown }]) => JSON.stringify(command.params) === JSON.stringify(event.data),
      ),
    ).toBe(true);
    await vi.waitFor(async () => expect(await monitor.checkQueue(queue)).toMatchObject({ messageCount: 0 }));
  }, 20_000);
});
