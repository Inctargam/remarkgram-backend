import { Module } from '@nestjs/common';
import { FilesGrpcClientConfig } from './files-grpc-client.config.js';

@Module({
  providers: [FilesGrpcClientConfig],
  exports: [FilesGrpcClientConfig],
})
export class FilesGrpcClientConfigModule {}
