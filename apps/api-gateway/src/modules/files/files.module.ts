import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { FILES_GRPC_PROTO_PATH, REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';
import { filesGrpcClientConfig } from './config/files-grpc-client.config.js';
import { FilesHttpController } from './presentation/http/controllers/files-http.controller.js';

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
            protoPath: FILES_GRPC_PROTO_PATH,
            url: config.url,
          },
        }),
      },
    ]),
  ],
  controllers: [FilesHttpController],
})
export class FilesModule {}
