import { POSTS_GRPC_PROTO_PATH, REMARKGRAM_POSTS_V1_PACKAGE_NAME } from '@app/posts-grpc';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';
import { postsConfig } from './config/posts.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigType<typeof postsConfig>>(postsConfig.KEY);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: REMARKGRAM_POSTS_V1_PACKAGE_NAME,
      protoPath: POSTS_GRPC_PROTO_PATH,
      url: config.url,
    },
  });
  await app.init();
  await app.startAllMicroservices();
  console.log('Server POSTS started on port', config.url);
}
void bootstrap();
