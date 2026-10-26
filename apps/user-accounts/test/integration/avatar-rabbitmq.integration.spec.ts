import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { INestMicroservice } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AvatarDeletionRmqServer } from '../../../files/src/infrastructure/rmq/avatar-deletion.rmq-server.js';
import { connect, type ChannelModel, type Channel, type GetMessage } from 'amqplib';
import {
  USER_ACCOUNTS_EXCHANGE,
  FILES_AVATAR_DELETION_EXCHANGE,
  FILES_AVATAR_DELETION_QUEUE,
  AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
} from '@app/message-broker';
import { PrismaUnitOfWork } from '../../src/database/prisma-unit-of-work.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { PrismaOutboxEventsRepository } from '../../src/features/outbox/infrastructure/persistence/repositories/prisma-outbox-events.repository.js';
import { OutboxWorker } from '../../src/features/outbox/application/workers/outbox.worker.js';
import { createAvatarDeletionEvent } from '../../src/features/users/application/integration-events/avatar-deletion-requested.event.js';
import { RmqIntegrationEventPublisher } from '../../src/features/outbox/infrastructure/rmq/rmq-integration-event.publisher.js';
import { AvatarDeletionEventConsumer } from '../../../files/src/presentation/messaging/avatar-deletion-event.consumer.js';
import { ScheduleAttachedFileDeletionUseCase } from '../../../files/src/application/use-cases/schedule-attached-file-deletion/schedule-attached-file-deletion.use-case.js';
import { FileDeletionJobsWorker } from '../../../files/src/application/workers/file-deletion-jobs.worker.js';
import { ImageUploadStateConflictError } from '../../../files/src/application/errors/image-upload.errors.js';

const brokerUrl = process.env.AVATAR_RABBITMQ_TEST_URL;
const managementUrl = process.env.AVATAR_RABBITMQ_MANAGEMENT_URL;

// Только тестовый брокер: suite создаёт собственный virtual host и удаляет его после проверки.
describe.runIf(Boolean(brokerUrl && managementUrl))('Avatar deletion over RabbitMQ', () => {
  const vhost = `avatar_test_${randomUUID()}`;
  const appUsername = `avatar_app_${randomUUID()}`;
  const appPassword = randomUUID();
  const main = FILES_AVATAR_DELETION_QUEUE;
  const dead = 'files_avatar_deletion_dead_queue';

  const deletion = { execute: vi.fn() };
  const worker = { run: vi.fn() };
  const services: INestMicroservice[] = [];
  let url: string;
  let connection: ChannelModel;
  let monitor: Channel;
  let publisher: RmqIntegrationEventPublisher;
  let admin: Client | undefined;
  let prisma: PrismaService | undefined;
  let events: PrismaOutboxEventsRepository | undefined;
  let outboxWorker: OutboxWorker | undefined;
  const databaseName = `avatar_rabbit_${randomUUID().replaceAll('-', '')}`;

  async function api(path: string, method = 'GET', body?: unknown): Promise<Response> {
    const target = new URL(managementUrl!);
    const credentials = `${decodeURIComponent(target.username)}:${decodeURIComponent(target.password)}`;
    target.username = '';
    target.password = '';
    target.pathname = `/api/${path}`;
    const response = await fetch(target, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`RabbitMQ management ${method} ${path}: ${response.status} ${await response.text()}`);
    return response;
  }

  async function startConsumer(execute = deletion.execute) {
    const module = await Test.createTestingModule({
      controllers: [AvatarDeletionEventConsumer],
      providers: [
        { provide: ScheduleAttachedFileDeletionUseCase, useValue: { execute } },
        { provide: FileDeletionJobsWorker, useValue: worker },
      ],
    }).compile();
    const service = module.createNestMicroservice(
      {
        strategy: new AvatarDeletionRmqServer(url, 100),
      },
      { logger: false },
    );
    services.push(service);
    await service.listen();
    return service;
  }

  async function take(queue: string): Promise<GetMessage> {
    let result: GetMessage | false = false;
    await vi.waitFor(
      async () => {
        result = await monitor.get(queue, { noAck: true });
        expect(result).not.toBe(false);
      },
      { timeout: 5_000 },
    );
    return result as unknown as GetMessage;
  }

  beforeAll(async () => {
    const overview = (await (await api('overview')).json()) as { rabbitmq_version: string };
    const [major, minor] = overview.rabbitmq_version.split('.').map(Number);
    if (major < 4 || (major === 4 && minor < 3)) {
      throw new Error('Avatar quorum integration tests require RabbitMQ 4.3+');
    }
    await api(`vhosts/${vhost}`, 'PUT', {});
    await api(`users/${appUsername}`, 'PUT', { password: appPassword, tags: '' });
    await api(`permissions/${vhost}/${appUsername}`, 'PUT', {
      configure: '.*',
      write: '.*',
      read: '.*',
    });
    const address = new URL(brokerUrl!);
    address.pathname = `/${vhost}`;
    address.username = appUsername;
    address.password = appPassword;
    url = address.toString();
    connection = await connect(url, { clientProperties: { connection_name: 'avatar-test-monitor' } });
    monitor = await connection.createChannel();
    publisher = new RmqIntegrationEventPublisher(url);
    publisher.onModuleInit();
    await startConsumer();
    await monitor.assertQueue('audit_test_queue', { durable: true });
    await monitor.bindQueue(
      'audit_test_queue',
      USER_ACCOUNTS_EXCHANGE,
      AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
    );

    if (process.env.AVATAR_INTEGRATION_DATABASE_URL) {
      admin = new Client({ connectionString: process.env.AVATAR_INTEGRATION_DATABASE_URL });
      await admin.connect();
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      const dbUrl = new URL(process.env.AVATAR_INTEGRATION_DATABASE_URL);
      dbUrl.pathname = `/${databaseName}`;
      prisma = new PrismaService({ url: dbUrl.toString() });
      const setup = new Client({ connectionString: dbUrl.toString() });
      await setup.connect();
      try {
        await setup.query(
          await readFile(
            'apps/user-accounts/prisma/migrations/20260925120000_avatar_deletion_outbox/migration.sql',
            'utf8',
          ),
        );
      } finally {
        await setup.end();
      }
      events = new PrismaOutboxEventsRepository(prisma);
      outboxWorker = new OutboxWorker(new PrismaUnitOfWork(prisma), events, publisher);
    }
  }, 20_000);

  beforeEach(async () => {
    for (const service of services.splice(0)) await service.close();
    deletion.execute.mockReset().mockResolvedValue(undefined);
    worker.run.mockReset().mockResolvedValue(undefined);
    for (const queue of [main, dead, 'audit_test_queue']) await monitor.purgeQueue(queue);
  });
  afterAll(async () => {
    for (const service of services) await service.close();
    await publisher?.onModuleDestroy();
    await connection?.close();
    await api(`vhosts/${vhost}`, 'DELETE');
    await api(`users/${appUsername}`, 'DELETE');
    await prisma?.$disconnect();
    if (admin) {
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it('redeclares topology on restart without losing queued messages', async () => {
    const event = createAvatarDeletionEvent(42, randomUUID());
    await publisher.publish(event);
    expect(await monitor.checkQueue(main)).toMatchObject({ messageCount: 1 });
    await startConsumer();
    await vi.waitFor(() => expect(deletion.execute).toHaveBeenCalledOnce());
    expect(deletion.execute.mock.calls[0][0]).toMatchObject({ params: event.data });
  });

  it('creates quorum queues with retries and confirmed dead lettering without policies', async () => {
    const queue: unknown = await (await api(`queues/${vhost}/${main}`)).json();
    expect(queue).toMatchObject({
      type: 'quorum',
      durable: true,
      arguments: {
        'x-delivery-limit': 3,
        'x-delayed-retry-type': 'failed',
        'x-delayed-retry-min': 100,
        'x-delayed-retry-max': 100,
        'x-dead-letter-strategy': 'at-least-once',
        'x-overflow': 'reject-publish',
      },
    });
    expect(await (await api(`policies/${vhost}`)).json()).toEqual([]);
    expect(await (await api(`queues/${vhost}/${dead}`)).json()).toMatchObject({ type: 'quorum' });
  });

  it('persists before a consumer exists and delivers one copy to each independent subscriber', async () => {
    const event = createAvatarDeletionEvent(42, randomUUID());
    if (prisma && events && outboxWorker) {
      await prisma.$transaction((tx) => events!.add(event, tx));
      await outboxWorker.publish(event.eventId);
      expect(
        (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.eventId } })).publishedAt,
      ).not.toBeNull();
    } else {
      await publisher.publish(event);
    }
    expect(await monitor.checkQueue(main)).toMatchObject({ messageCount: 1, consumerCount: 0 });
    expect(
      (JSON.parse((await take('audit_test_queue')).content.toString()) as { data: unknown }).data,
    ).toEqual(event);
    await startConsumer();
    await vi.waitFor(() => expect(worker.run).toHaveBeenCalledOnce());
    expect(deletion.execute).toHaveBeenCalledOnce();
  });

  it('rejects an unroutable confirmed publication and keeps its outbox record pending', async () => {
    const event = { ...createAvatarDeletionEvent(42, randomUUID()), eventType: 'users.no-subscriber.v1' };
    await expect(publisher.publish(event)).rejects.toThrow('without a route');
    if (prisma && events && outboxWorker) {
      await prisma.$transaction((tx) => events!.add(event, tx));
      await outboxWorker.publish(event.eventId);
      expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.eventId } })).toMatchObject({
        publishedAt: null,
        lastError: expect.stringContaining('without a route') as unknown,
      });
      await monitor.bindQueue('audit_test_queue', USER_ACCOUNTS_EXCHANGE, event.eventType);
      await outboxWorker.publish(event.eventId);
      expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.eventId } })).toMatchObject({
        publishedAt: expect.any(Date) as unknown,
        lastError: null,
      });
    }
  });

  it('uses three delayed retries then DLQ, without redelivering to other subscribers', async () => {
    const attempts: number[] = [];
    deletion.execute.mockImplementation(() => {
      attempts.push(Date.now());
      return Promise.reject(new Error('Database offline'));
    });
    await startConsumer();
    const event = createAvatarDeletionEvent(42, randomUUID());
    await publisher.publish(event);
    const failed = await take(dead);
    expect(deletion.execute).toHaveBeenCalledTimes(4);
    for (let i = 1; i < attempts.length; i++) {
      expect(attempts[i] - attempts[i - 1]).toBeGreaterThanOrEqual(90);
    }
    expect(failed.properties.messageId).toBe(event.eventId);
    expect(failed.properties.headers).toMatchObject({
      'x-first-death-reason': 'delivery_limit',
    });
    expect((JSON.parse(failed.content.toString()) as { data: unknown }).data).toEqual(event);
    expect(await monitor.checkQueue('audit_test_queue')).toMatchObject({ messageCount: 1 });
    expect(worker.run).not.toHaveBeenCalled();
  });

  it('stops retrying after success', async () => {
    deletion.execute.mockRejectedValueOnce(new Error('Temporary error'));
    await startConsumer();
    await publisher.publish(createAvatarDeletionEvent(42, randomUUID()));
    await vi.waitFor(() => expect(worker.run).toHaveBeenCalledOnce());
    expect(deletion.execute).toHaveBeenCalledTimes(2);
    expect(await monitor.checkQueue(dead)).toMatchObject({ messageCount: 0 });
  });

  it('sends state conflicts and malformed payloads straight to DLQ', async () => {
    deletion.execute.mockRejectedValue(new ImageUploadStateConflictError());
    await startConsumer();
    await publisher.publish(createAvatarDeletionEvent(42, randomUUID()));
    expect((await take(dead)).properties.headers?.['x-first-death-reason']).toBe('rejected');
    monitor.publish(
      USER_ACCOUNTS_EXCHANGE,
      AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
      Buffer.from(JSON.stringify({ pattern: AVATAR_DELETION_REQUESTED_V1_EVENT_NAME, data: {} })),
      { messageId: randomUUID() },
    );
    expect((await take(dead)).properties.headers?.['x-first-death-reason']).toBe('rejected');
    expect(deletion.execute).toHaveBeenCalledOnce();
  });

  it('dead-letters unknown Nest patterns using the configured dead-letter exchange', async () => {
    await startConsumer();
    monitor.publish(
      FILES_AVATAR_DELETION_EXCHANGE,
      'main',
      Buffer.from(JSON.stringify({ pattern: 'unknown', data: {} })),
      { messageId: randomUUID() },
    );
    const message = await take(dead);
    expect((JSON.parse(message.content.toString()) as { pattern: unknown }).pattern).toBe('unknown');
    expect(deletion.execute).not.toHaveBeenCalled();
  });

  it('accepts old direct-to-queue messages without retry headers or aggregate metadata', async () => {
    await startConsumer();
    const { eventId, eventType, data } = createAvatarDeletionEvent(42, randomUUID());
    const legacy = { eventId, eventType, data };
    monitor.sendToQueue(main, Buffer.from(JSON.stringify({ pattern: legacy.eventType, data: legacy })), {
      persistent: true,
    });
    await vi.waitFor(() => expect(worker.run).toHaveBeenCalledOnce());
  });

  it('shares a queue between replicas instead of broadcasting to each replica', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    await startConsumer(first);
    await startConsumer(second);
    for (let i = 0; i < 10; i++) await publisher.publish(createAvatarDeletionEvent(42, randomUUID()));
    await vi.waitFor(() => expect(first.mock.calls.length + second.mock.calls.length).toBe(10));
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it('redelivers after a consumer dies before ack', async () => {
    deletion.execute.mockReturnValueOnce(new Promise<void>(() => {}));
    const service = await startConsumer();
    const event = createAvatarDeletionEvent(42, randomUUID());
    await publisher.publish(event);
    await vi.waitFor(() => expect(deletion.execute).toHaveBeenCalledOnce());
    expect(worker.run).not.toHaveBeenCalled();
    await service.close();
    services.splice(services.indexOf(service), 1);
    await startConsumer();
    await vi.waitFor(() => expect(worker.run).toHaveBeenCalledOnce());
    expect(deletion.execute).toHaveBeenCalledTimes(2);
  });

  it.runIf(Boolean(process.env.AVATAR_INTEGRATION_DATABASE_URL))(
    'repeats the same event after losing the publication result',
    async () => {
      const event = createAvatarDeletionEvent(42, randomUUID());
      await prisma!.$transaction((tx) => events!.add(event, tx));
      const lossy = new OutboxWorker(new PrismaUnitOfWork(prisma!), events!, {
        publish: async (message) => {
          await publisher.publish(message);
          throw new Error('Publication result lost');
        },
      });
      await lossy.publish(event.eventId);
      expect(
        (await prisma!.outboxEvent.findUniqueOrThrow({ where: { id: event.eventId } })).publishedAt,
      ).toBeNull();
      await outboxWorker!.publish(event.eventId);
      const first = await take(main);
      const second = await take(main);
      expect(first.properties.messageId).toBe(event.eventId);
      expect(second.properties.messageId).toBe(event.eventId);
      expect(first.content).toEqual(second.content);
    },
  );

  it('retains dead letters until the DLQ binding is restored', async () => {
    await startConsumer();
    await monitor.unbindQueue(dead, FILES_AVATAR_DELETION_EXCHANGE, 'dead');
    deletion.execute.mockRejectedValue(new ImageUploadStateConflictError());
    const event = createAvatarDeletionEvent(42, randomUUID());
    try {
      await publisher.publish(event);
      await vi.waitFor(() => expect(deletion.execute).toHaveBeenCalledOnce());
      expect(await monitor.get(dead, { noAck: true })).toBe(false);
    } finally {
      await monitor.bindQueue(dead, FILES_AVATAR_DELETION_EXCHANGE, 'dead');
    }
    // Внутренний dead-letter worker повторяет отправку; его интервал по умолчанию — 180 секунд.
    await vi.waitFor(
      async () => {
        const message = await monitor.get(dead, { noAck: true });
        expect(message && message.properties.messageId).toBe(event.eventId);
      },
      { timeout: 210_000 },
    );
  }, 215_000);

  it('reconnects and restores missing bindings before consuming', async () => {
    await startConsumer();
    await publisher.publish(createAvatarDeletionEvent(42, randomUUID()));
    await vi.waitFor(() => expect(worker.run).toHaveBeenCalledOnce());
    await monitor.unbindQueue(main, USER_ACCOUNTS_EXCHANGE, AVATAR_DELETION_REQUESTED_V1_EVENT_NAME);
    await monitor.unbindQueue(main, FILES_AVATAR_DELETION_EXCHANGE, 'main');
    await monitor.unbindQueue(dead, FILES_AVATAR_DELETION_EXCHANGE, 'dead');
    // Management API обновляет список соединений с задержкой.
    const appConnections = await vi.waitFor(
      async () => {
        const connections = (await (await api('connections')).json()) as {
          name: string;
          vhost: string;
          client_properties: { connection_name?: string };
        }[];
        const active = connections.filter(
          (item) => item.vhost === vhost && item.client_properties.connection_name !== 'avatar-test-monitor',
        );
        expect(active).toHaveLength(2);
        return active;
      },
      { timeout: 15_000 },
    );
    for (const item of appConnections) await api(`connections/${encodeURIComponent(item.name)}`, 'DELETE');
    await vi.waitFor(
      async () => {
        expect(await monitor.checkQueue(main)).toMatchObject({ consumerCount: 1 });
        // Закрытие соединения через API асинхронно: старый consumer ещё может быть виден.
        expect(await (await api(`bindings/${vhost}`)).json()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              source: USER_ACCOUNTS_EXCHANGE,
              destination: main,
              routing_key: AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
            }),
            expect.objectContaining({
              source: FILES_AVATAR_DELETION_EXCHANGE,
              destination: main,
              routing_key: 'main',
            }),
            expect.objectContaining({
              source: FILES_AVATAR_DELETION_EXCHANGE,
              destination: dead,
              routing_key: 'dead',
            }),
          ]),
        );
      },
      { timeout: 15_000 },
    );
    await vi.waitFor(
      async () => {
        await publisher.publish(createAvatarDeletionEvent(42, randomUUID()));
      },
      { timeout: 15_000, interval: 250 },
    );
    await vi.waitFor(() => expect(worker.run.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 10_000,
    });
  }, 45_000);
});
