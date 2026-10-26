import { PAYMENTS_GRPC_PROTO_PATH, REMARKGRAM_PAYMENTS_V1_PACKAGE_NAME } from '@app/payments-grpc';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { type ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { paymentsConfig } from './config/payments.config.js';
import { dbosConfig } from './config/dbos.config.js';
import { PaymentsModule } from './payments.module.js';

async function bootstrap() {
  const app = await NestFactory.create(PaymentsModule, { rawBody: true });
  const config = app.get<ConfigType<typeof paymentsConfig>>(paymentsConfig.KEY);
  const durableConfig = app.get<ConfigType<typeof dbosConfig>>(dbosConfig.KEY);
  DBOS.setConfig({
    name: durableConfig.name,
    applicationVersion: durableConfig.applicationVersion,
    executorID: durableConfig.executorId,
    systemDatabaseUrl: durableConfig.systemDatabaseUrl,
    systemDatabasePoolSize: durableConfig.systemDatabasePoolSize,
    runAdminServer: false,
    runMigrations: durableConfig.runMigrations,
  });
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: REMARKGRAM_PAYMENTS_V1_PACKAGE_NAME,
      protoPath: PAYMENTS_GRPC_PROTO_PATH,
      url: config.url,
      loader: { objects: true, arrays: true },
    },
  });
  app.enableShutdownHooks();
  await app.startAllMicroservices();
  await app.listen(config.httpPort);
  console.log(`PAYMENTS started: gRPC ${config.url}, HTTP ${config.httpPort}`);
}
void bootstrap();
