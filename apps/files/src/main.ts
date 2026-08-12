import { NestFactory } from '@nestjs/core';
import type { ConfigType } from '@nestjs/config';
import type { AsyncMicroserviceOptions, MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { filesConfig } from './config/files.config.js';
import { FilesModule } from './files.module.js';
import { FILES_GRPC_PROTO_PATH, REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(FilesModule, {
    inject: [filesConfig.KEY],
    useFactory: (config: ConfigType<typeof filesConfig>): MicroserviceOptions => ({
      transport: Transport.GRPC,
      options: {
        package: REMARKGRAM_FILES_V1_PACKAGE_NAME,
        protoPath: FILES_GRPC_PROTO_PATH,
        url: config.url,
      },
    }),
  });
  const config = app.get<ConfigType<typeof filesConfig>>(filesConfig.KEY);

  await app.listen();
  console.log('Server FILES started on port', config.url);
}
void bootstrap();
