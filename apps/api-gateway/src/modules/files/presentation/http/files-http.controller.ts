import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { FilesGrpcClientAdapter } from '../../infrastructure/grpc/files-grpc-client.adapter.js';
import { type UploadFileResponse } from '@app/files-grpc';

@Controller('files')
export class FilesHttpController {
  constructor(private readonly filesGrpc: FilesGrpcClientAdapter) {}

  @Post('')
  @HttpCode(HttpStatus.CREATED)
  async uploadFile(): Promise<UploadFileResponse> {
    return this.filesGrpc.uploadFile({ originalFilename: 'supper-name-files.png' });
  }
}
