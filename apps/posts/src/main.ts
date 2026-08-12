import { POSTS_GRPC_PROTO_PATH, REMARKGRAM_POSTS_V1_PACKAGE_NAME } from '@app/posts-grpc';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Transport, type AsyncMicroserviceOptions, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';
import { postsConfig } from './config/posts.config.js';

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

  await app.listen();
  console.log('Server POSTS started on port', config.url);
}
void bootstrap();
