import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    const databaseUrl = configService.getOrThrow<string>('POSTS_DATABASE_URL');

    super({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
