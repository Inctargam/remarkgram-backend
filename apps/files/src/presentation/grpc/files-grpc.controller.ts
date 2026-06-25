import { Controller, Logger } from '@nestjs/common';
import { FilesServiceControllerMethods } from '@app/files-grpc';
import type { UploadFileRequest, UploadFileResponse } from '@app/files-grpc';
import { randomUUID } from 'node:crypto';

@Controller()
@FilesServiceControllerMethods()
export class FilesGrpcController {
  logger: Logger;
  constructor() {
    this.logger = new Logger(FilesGrpcController.name);
  }

  async uploadFile(request: UploadFileRequest): Promise<UploadFileResponse> {
    this.logger.log('UploadFile:request ->', request);
    return Promise.resolve({
      id: randomUUID(),
    });
  }
}
