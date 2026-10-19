import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseConfig } from '../config/database.config.js';
import { PrismaClient } from './prisma/generated/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(@Inject(databaseConfig.KEY) config: ConfigType<typeof databaseConfig>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.url,
        query_timeout: 10_000,
      }),
    });
  }
  // Закрывает соединения Prisma при завершении работы Nest-приложения.
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
