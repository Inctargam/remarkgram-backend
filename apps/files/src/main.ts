import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { FilesConfig } from './config/files.config.js';
import { FilesModule } from './files.module.js';
import { REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';
import { join } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create(FilesModule);
  const config = app.get(FilesConfig);
  const protoPath = join(import.meta.dirname, '../../../libs/contracts/files-grpc/src/proto/files.proto');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: REMARKGRAM_FILES_V1_PACKAGE_NAME,
      protoPath,
      url: config.url,
    },
  });
  await app.startAllMicroservices();
  console.log('Server FILES started on port', config.url);
}
void bootstrap();
