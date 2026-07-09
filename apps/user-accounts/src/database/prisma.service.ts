import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseConfig } from '../config/database.config.js';
import { PrismaClient } from './generated/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(databaseConfig.KEY) config: ConfigType<typeof databaseConfig>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.url,
        // query_timeout — настройка node-postgres (отсутствует в доке Prisma). Она ограничивает время выполнения query,
        // чтобы зависший запрос завершался диагностируемой ошибкой, а не висел в Postman.
        query_timeout: 10_000,
      }),
    });
  }

  /** Закрывает соединения Prisma при завершении работы Nest-приложения. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
