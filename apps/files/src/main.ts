import { NestFactory } from '@nestjs/core';
import type { ConfigType } from '@nestjs/config';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { filesConfig } from './config/files.config.js';
import { FilesModule } from './files.module.js';
import { FILES_GRPC_PROTO_PATH, REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';
import { filesMessageBrokerConfig } from './config/message-broker.config.js';
import { FILES_POST_EVENTS_QUEUE, POST_DELETED_V1_EVENT_NAME, POSTS_EXCHANGE } from '@app/message-broker';

async function bootstrap() {
  const app = await NestFactory.create(FilesModule);
  const config = app.get<ConfigType<typeof filesConfig>>(filesConfig.KEY);
  const brokerConfig = app.get<ConfigType<typeof filesMessageBrokerConfig>>(filesMessageBrokerConfig.KEY);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: REMARKGRAM_FILES_V1_PACKAGE_NAME,
      protoPath: FILES_GRPC_PROTO_PATH,
      url: config.url,
    },
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [brokerConfig.url],
      queue: FILES_POST_EVENTS_QUEUE,
      queueOptions: {
        durable: true,
      },
      exchange: POSTS_EXCHANGE,
      exchangeType: 'topic',
      routingKey: POST_DELETED_V1_EVENT_NAME,
      noAck: true,
    },
  });
  await app.startAllMicroservices();
  await app.init();
  console.log('Server FILES started on port', config.url);
}
void bootstrap();
