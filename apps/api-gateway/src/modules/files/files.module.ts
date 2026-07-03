import { Module } from '@nestjs/common';
import { FilesGrpcClientModule } from './infrastructure/grpc/files-grpc-client.module.js';
import { FilesHttpController } from './presentation/http/controllers/files-http.controller.js';

@Module({
  imports: [FilesGrpcClientModule],
  controllers: [FilesHttpController],
})
export class FilesModule {}
