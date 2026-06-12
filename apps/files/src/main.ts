import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { FilesConfig } from './config/files.config.js';
import { FilesModule } from './files.module.js';

async function bootstrap() {
  const app = await NestFactory.create(FilesModule);
  const config = app.get(FilesConfig);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: config.tcpHost,
      port: config.tcpPort,
    },
  });

  await app.startAllMicroservices();
  console.log('Server FILES started on port', config.tcpPort);
}
void bootstrap();
