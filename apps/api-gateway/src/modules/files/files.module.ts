import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';
import { join } from 'node:path';
import { filesGrpcClientConfig } from './config/files-grpc-client.config.js';
import { FilesHttpController } from './presentation/http/controllers/files-http.controller.js';

const protoPath = join(import.meta.dirname, '../../../../../libs/contracts/files-grpc/src/proto/files.proto');

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
            protoPath,
            url: config.url,
          },
        }),
      },
    ]),
  ],
  controllers: [FilesHttpController],
})
export class FilesModule {}
