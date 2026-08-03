import { Controller, UseFilters } from '@nestjs/common';
import { FilesServiceControllerMethods } from '@app/files-grpc';
import type { InitiateImageUploadsRequest, InitiateImageUploadsResponse } from '@app/files-grpc';
import { CommandBus } from '@nestjs/cqrs';
import { InitiateImageUploadsCommand } from '../../application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
import { FilesRpcExceptionFilter } from './filters/files-rpc-exception.filter.js';

@Controller()
@FilesServiceControllerMethods()
@UseFilters(FilesRpcExceptionFilter)
export class FilesGrpcController {
  constructor(private readonly commandBus: CommandBus) {}

  initiateImageUploads(request: InitiateImageUploadsRequest): Promise<InitiateImageUploadsResponse> {
    return this.commandBus.execute(
      new InitiateImageUploadsCommand({
        userId: Number(request.userId),
        images: request.images,
      }),
    );
  }
}
