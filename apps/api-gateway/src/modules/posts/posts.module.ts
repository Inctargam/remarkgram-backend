import { POSTS_GRPC_PROTO_PATH, REMARKGRAM_POSTS_V1_PACKAGE_NAME } from '@app/posts-grpc';
import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { postsGrpcClientConfig } from './config/posts-grpc-client.config.js';
import { PostsHttpController } from './presentation/http/controllers/posts-http.controller.js';
import { UserPostsHttpController } from '../user-accounts/presentation/http/controllers/user-posts.http-controller.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
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
    ]),
  ],
  controllers: [PostsHttpController, UserPostsHttpController],
})
export class PostsModule {}
