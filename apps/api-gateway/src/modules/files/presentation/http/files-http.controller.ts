import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { UploadFileResponse } from '@app/files-grpc';
import { Public } from '../../../../common/presentation/http/decorators/public.decorator.js';
import { FilesGrpcClientAdapter } from '../../infrastructure/grpc/files-grpc-client.adapter.js';

@Controller('files')
export class FilesHttpController {
  constructor(private readonly filesGrpcClient: FilesGrpcClientAdapter) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  uploadFile(): Promise<UploadFileResponse> {
    return this.filesGrpcClient.uploadFile({ originalFilename: 'supper-name-files.png' });
  }
}
