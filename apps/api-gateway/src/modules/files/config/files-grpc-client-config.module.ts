import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FilesGrpcClientConfig } from './files-grpc-client.config.js';

@Module({
  imports: [ConfigModule],
  providers: [FilesGrpcClientConfig],
  exports: [FilesGrpcClientConfig],
})
export class FilesGrpcClientConfigModule {}
