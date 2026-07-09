import { NestFactory } from '@nestjs/core';
import type { ConfigType } from '@nestjs/config';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  USER_ACCOUNTS_GRPC_PROTO_PATH,
} from '@app/user-accounts-grpc';
import { UserAccountsModule } from './app.module.js';
import { userAccountsGrpcConfig } from './config/user-accounts-grpc.config.js';

async function bootstrap() {
  const app = await NestFactory.create(UserAccountsModule);
  const config = app.get<ConfigType<typeof userAccountsGrpcConfig>>(userAccountsGrpcConfig.KEY);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
      protoPath: USER_ACCOUNTS_GRPC_PROTO_PATH,
      url: config.url,
    },
  });

  await app.init();
  await app.startAllMicroservices();
}
void bootstrap();
