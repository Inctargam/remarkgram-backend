import { FILES_GRPC_PROTO_PATH, REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';
import { POSTS_GRPC_PROTO_PATH, REMARKGRAM_POSTS_V1_PACKAGE_NAME } from '@app/posts-grpc';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  USER_ACCOUNTS_GRPC_PROTO_PATH,
} from '@app/user-accounts-grpc';
import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { filesGrpcClientConfig } from '../files/config/files-grpc-client.config.js';
import { postsGrpcClientConfig } from '../posts/config/posts-grpc-client.config.js';
import { userAccountsGrpcClientConfig } from '../user-accounts/config/user-accounts-grpc-client.config.js';
import { TestingHttpController } from './presentation/http/controllers/testing-http.controller.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: REMARKGRAM_FILES_V1_PACKAGE_NAME,
        inject: [filesGrpcClientConfig.KEY],
        useFactory: (config: ConfigType<typeof filesGrpcClientConfig>) => ({
          transport: Transport.GRPC,
          options: {
            package: REMARKGRAM_FILES_V1_PACKAGE_NAME,
            protoPath: FILES_GRPC_PROTO_PATH,
            url: config.url,
          },
        }),
      },
      {
        name: REMARKGRAM_POSTS_V1_PACKAGE_NAME,
        inject: [postsGrpcClientConfig.KEY],
        useFactory: (config: ConfigType<typeof postsGrpcClientConfig>) => ({
          transport: Transport.GRPC,
          options: {
            package: REMARKGRAM_POSTS_V1_PACKAGE_NAME,
            protoPath: POSTS_GRPC_PROTO_PATH,
            url: config.url,
          },
        }),
      },
      {
        name: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
        inject: [userAccountsGrpcClientConfig.KEY],
        useFactory: (config: ConfigType<typeof userAccountsGrpcClientConfig>) => ({
          transport: Transport.GRPC,
          options: {
            package: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
            protoPath: USER_ACCOUNTS_GRPC_PROTO_PATH,
            url: config.url,
          },
        }),
      },
    ]),
  ],
  controllers: [TestingHttpController],
})
export class TestingModule {}
