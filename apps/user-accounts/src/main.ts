import { NestFactory } from '@nestjs/core';
import type { ConfigType } from '@nestjs/config';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME } from '@app/user-accounts-grpc';
import { join } from 'node:path';
import { UserAccountsModule } from './app.module.js';
import { userAccountsGrpcConfig } from './config/user-accounts-grpc.config.js';

async function bootstrap() {
  const app = await NestFactory.create(UserAccountsModule);
  const config = app.get<ConfigType<typeof userAccountsGrpcConfig>>(userAccountsGrpcConfig.KEY);
  const protoPath = join(
    import.meta.dirname,
    '../../../libs/contracts/user-accounts-grpc/src/proto/user-accounts.proto',
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
      protoPath,
      url: config.url,
    },
  });

  await app.startAllMicroservices();
}
void bootstrap();
