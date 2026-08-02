import { Controller, Logger, UseFilters } from '@nestjs/common';
import { FilesServiceControllerMethods } from '@app/files-grpc';
import type { CreateImageUploadsRequest, CreateImageUploadsResponse } from '@app/files-grpc';
import { CommandBus } from '@nestjs/cqrs';
import { CreateImageUploadSessionsCommand } from '../../application/use-cases/create-image-upload-sessions/create-image-upload-sessions.use-case.js';
import { FilesRpcExceptionFilter } from './filters/files-rpc-exception.filter.js';

@Controller()
@FilesServiceControllerMethods()
@UseFilters(FilesRpcExceptionFilter)
export class FilesGrpcController {
  private readonly logger = new Logger(FilesGrpcController.name);

  constructor(private readonly commandBus: CommandBus) {}

  createImageUploads(request: CreateImageUploadsRequest): Promise<CreateImageUploadsResponse> {
    this.logger.log({ userId: request.userId, imageCount: request.images.length });

    return this.commandBus.execute(
      new CreateImageUploadSessionsCommand({
        userId: request.userId,
        images: request.images,
      }),
    );
  }
}
