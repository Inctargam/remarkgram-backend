import { POSTS_GRPC_PROTO_PATH, REMARKGRAM_POSTS_V1_PACKAGE_NAME } from '@app/posts-grpc';
import { DBOS } from '@dbos-inc/dbos-sdk';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Transport, type AsyncMicroserviceOptions, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';
import { postsConfig } from './config/posts.config.js';
import { dbosConfig } from './config/dbos.config.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(AppModule, {
    inject: [postsConfig.KEY],
    useFactory: (config: ConfigType<typeof postsConfig>): MicroserviceOptions => ({
      transport: Transport.GRPC,
      options: {
        package: REMARKGRAM_POSTS_V1_PACKAGE_NAME,
        protoPath: POSTS_GRPC_PROTO_PATH,
        url: config.url,
      },
    }),
  });
  const config = app.get<ConfigType<typeof postsConfig>>(postsConfig.KEY);
  const durableExecutionConfig = app.get<ConfigType<typeof dbosConfig>>(dbosConfig.KEY);

  app.enableShutdownHooks();

  DBOS.setConfig({
    name: durableExecutionConfig.name,
    applicationVersion: durableExecutionConfig.applicationVersion,
    executorID: durableExecutionConfig.executorId,
    systemDatabaseUrl: durableExecutionConfig.systemDatabaseUrl,
    systemDatabasePoolSize: durableExecutionConfig.systemDatabasePoolSize,
    runMigrations: durableExecutionConfig.runMigrations,
  });

  // init() сначала вызывает lifecycle hooks gRPC-клиентов. Иначе recovery во время
  // DBOS.launch() может обратиться к Files до инициализации GrpcImageUploadsGateway.
  await app.init();

  // gRPC начинает принимать новые запросы только после проверки DBOS-схемы и recovery.
  await DBOS.launch();
  await app.listen();
  console.log('Server POSTS started on port', config.url);
}
void bootstrap();
