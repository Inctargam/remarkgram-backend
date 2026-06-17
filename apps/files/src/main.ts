import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { FilesConfig } from './config/files.config.js';
import { FilesModule } from './files.module.js';
import { filesGrpcContract } from '../../../libs/contracts/files-grpc/index.js';
import { resolve } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create(FilesModule);
  const config = app.get(FilesConfig);
  const protoPath = resolve(process.cwd(), filesGrpcContract.protoPath);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: filesGrpcContract.packageName,
      protoPath,
      url: config.url,
    },
  });
  await app.startAllMicroservices();
  console.log('Server FILES started on port', config.url);
}
void bootstrap();
