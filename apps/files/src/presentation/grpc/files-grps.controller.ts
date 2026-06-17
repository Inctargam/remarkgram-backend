import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { filesGrpcContract } from '../../../../../libs/contracts/files-grpc/index.js';
import type {
  UploadFileRequest,
  UploadFileResponse,
} from '../../../../../libs/contracts/files-grpc/index.js';
import { randomUUID } from 'node:crypto';

@Controller()
export class FilesGrpcController {
  logger: Logger;
  constructor() {
    this.logger = new Logger(FilesGrpcController.name);
  }
  @GrpcMethod(filesGrpcContract.serviceName, 'UploadFile')
  async uploadFile(request: UploadFileRequest): Promise<UploadFileResponse> {
    this.logger.log('UploadFile:request ->', request);
    return Promise.resolve({
      id: randomUUID(),
    });
  }
}
