import { Module } from '@nestjs/common';
import { FilesGrpcClientAdapter } from './infrastructure/grpc/files-grpc-client.adapter.js';
import { FilesGrpcClientModule } from './config/files-grpc-client.module.js';
import { FilesHttpController } from './presentation/http/files-http.controller.js';

@Module({
  imports: [FilesGrpcClientModule],
  controllers: [FilesHttpController],
  providers: [FilesGrpcClientAdapter],
})
export class FilesModule {}
