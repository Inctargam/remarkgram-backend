import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';
import { join } from 'node:path';
import { FilesGrpcClientConfig } from '../../config/files-grpc-client.config.js';
import { FilesGrpcClientConfigModule } from '../../config/files-grpc-client-config.module.js';
import { FilesGrpcClientAdapter } from './files-grpc-client.adapter.js';

const protoPath = join(
  import.meta.dirname,
  '../../../../../../../libs/contracts/files-grpc/src/proto/files.proto',
);

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: REMARKGRAM_FILES_V1_PACKAGE_NAME,
        imports: [FilesGrpcClientConfigModule],
        inject: [FilesGrpcClientConfig],
        useFactory: (config: FilesGrpcClientConfig) => ({
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
  providers: [FilesGrpcClientAdapter],
  exports: [FilesGrpcClientAdapter],
})
export class FilesGrpcClientModule {}
