import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { FilesConfig } from './config/files.config.js';
import { FilesModule } from './files.module.js';
import { FILES_GRPC_PROTO_PATH, REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';

async function bootstrap() {
  const app = await NestFactory.create(FilesModule);
  const config = app.get(FilesConfig);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: REMARKGRAM_FILES_V1_PACKAGE_NAME,
      protoPath: FILES_GRPC_PROTO_PATH,
      url: config.url,
    },
  });
  await app.startAllMicroservices();
  console.log('Server FILES started on port', config.url);
}
void bootstrap();
