import { DBOS } from '@dbos-inc/dbos-sdk';
import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { Injectable, type BeforeApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service.js';

@Injectable()
export class DbosLifecycleService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    // Checkpoints транзакций находятся в прикладной БД, отдельно от systemDatabaseUrl.
    await PrismaDataSource.initializeDBOSSchema(this.prisma);
    await DBOS.launch();
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (DBOS.isInitialized()) await DBOS.shutdown();
  }
}
