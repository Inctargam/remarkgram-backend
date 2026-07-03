import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME } from '@app/user-accounts-grpc';
import { join } from 'node:path';
import { UserAccountsGrpcClientConfigModule } from '../../config/user-accounts-grpc-client-config.module.js';
import { UserAccountsGrpcClientConfig } from '../../config/user-accounts-grpc-client.config.js';

const protoPath = join(
  import.meta.dirname,
  '../../../../../../../libs/contracts/user-accounts-grpc/src/proto/user-accounts.proto',
);

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
        imports: [UserAccountsGrpcClientConfigModule],
        inject: [UserAccountsGrpcClientConfig],
        useFactory: (config: UserAccountsGrpcClientConfig) => ({
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
