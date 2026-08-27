import { DBOS } from '@dbos-inc/dbos-sdk';
import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';

@Injectable()
export class DbosLifecycleService implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(): Promise<void> {
    // DBOS останавливается в более ранней lifecycle-фазе, чем Prisma. Поэтому Nest
    // гарантированно дождётся workflow shutdown до PrismaService.$disconnect().
    if (DBOS.isInitialized()) {
      await DBOS.shutdown();
    }
  }
}
