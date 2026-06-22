import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { resolve } from 'node:path';
import { filesGrpcContract } from '@app/files-grpc';
import { FilesGrpcClientConfig } from './files-grpc-client.config.js';
import { FilesGrpcClientConfigModule } from './files-grpc-client-config.module.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: filesGrpcContract.clientToken,
        imports: [FilesGrpcClientConfigModule],
        inject: [FilesGrpcClientConfig],
        useFactory: (config: FilesGrpcClientConfig) => ({
          transport: Transport.GRPC,
          options: {
            package: filesGrpcContract.packageName,
            protoPath: resolve(process.cwd(), filesGrpcContract.protoPath),
            url: config.url,
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class FilesGrpcClientModule {}
