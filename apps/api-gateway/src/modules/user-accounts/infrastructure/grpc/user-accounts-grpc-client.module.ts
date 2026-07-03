import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME } from '@app/user-accounts-grpc';
import { join } from 'node:path';
import { userAccountsGrpcClientConfig } from '../../config/user-accounts-grpc-client.config.js';

const protoPath = join(
  import.meta.dirname,
  '../../../../../../../libs/contracts/user-accounts-grpc/src/proto/user-accounts.proto',
);

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
        inject: [userAccountsGrpcClientConfig.KEY],
        useFactory: (config: ConfigType<typeof userAccountsGrpcClientConfig>) => ({
          transport: Transport.GRPC,
          options: {
            package: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
            protoPath,
            url: config.url,
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class UserAccountsGrpcClientModule {}
