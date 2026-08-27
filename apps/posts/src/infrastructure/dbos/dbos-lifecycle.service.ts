import { DBOS } from '@dbos-inc/dbos-sdk';
import {
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';

@Injectable()
export class DbosLifecycleService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  async onApplicationBootstrap(): Promise<void> {
    // Nest вызывает этот hook после всех onModuleInit(), но до открытия gRPC-порта.
    // Поэтому зависимости workflow уже готовы, а новые запросы ещё не принимаются.
    await DBOS.launch();
  }

  async beforeApplicationShutdown(): Promise<void> {
    // DBOS останавливается в более ранней lifecycle-фазе, чем Prisma. Поэтому Nest
    // гарантированно дождётся workflow shutdown до PrismaService.$disconnect().
    if (DBOS.isInitialized()) {
      await DBOS.shutdown();
    }
  }
}
