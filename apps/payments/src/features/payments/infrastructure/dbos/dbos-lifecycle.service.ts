import { DBOS } from '@dbos-inc/dbos-sdk';
import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { Injectable, type BeforeApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service.js';

export const PAYMENT_WEBHOOK_QUEUE = 'payment-webhooks';

@Injectable()
export class DbosLifecycleService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  // инфраструктурный NestJS-сервис, который привязывает жизненный цикл DBOS к жизненному циклу приложения Payments.
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    // Это не общая системная база DBOS, а схема, необходимая интеграции PrismaDataSource.
    // Она нужна для транзакций
    await PrismaDataSource.initializeDBOSSchema(this.prisma);
    await DBOS.launch();
    await DBOS.registerQueue(PAYMENT_WEBHOOK_QUEUE, {
      concurrency: 10,
      onConflict: 'update_if_latest_version',
    });
  }

  async beforeApplicationShutdown(): Promise<void> {
    // Stop durable work before Prisma closes its connection pool.
    if (DBOS.isInitialized()) await DBOS.shutdown();
  }
}
