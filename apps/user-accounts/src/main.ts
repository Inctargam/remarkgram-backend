import { DBOS } from '@dbos-inc/dbos-sdk';
import { dbosConfig } from './config/dbos.config.js';
import { NestFactory } from '@nestjs/core';
import type { ConfigType } from '@nestjs/config';
import type { AsyncMicroserviceOptions, MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  USER_ACCOUNTS_GRPC_PROTO_PATH,
} from '@app/user-accounts-grpc';
import { UserAccountsModule } from './app.module.js';
import { userAccountsGrpcConfig } from './config/user-accounts-grpc.config.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(UserAccountsModule, {
    inject: [userAccountsGrpcConfig.KEY],
    useFactory: (config: ConfigType<typeof userAccountsGrpcConfig>): MicroserviceOptions => ({
      transport: Transport.GRPC,
      options: {
        package: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
        protoPath: USER_ACCOUNTS_GRPC_PROTO_PATH,
        url: config.url,
      },
    }),
  });

  const durableConfig = app.get<ConfigType<typeof dbosConfig>>(dbosConfig.KEY);
  app.enableShutdownHooks();
  DBOS.setConfig({
    name: durableConfig.name,
    applicationVersion: durableConfig.applicationVersion,
    executorID: durableConfig.executorId,
    systemDatabaseUrl: durableConfig.systemDatabaseUrl,
    systemDatabasePoolSize: durableConfig.systemDatabasePoolSize,
    runMigrations: durableConfig.runMigrations,
  });
  await app.listen();
}
void bootstrap();
