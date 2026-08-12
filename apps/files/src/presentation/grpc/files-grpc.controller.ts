import { Controller, UseFilters } from '@nestjs/common';
import {
  FilesServiceControllerMethods,
  GetPublicFileUrlRequest,
  GetPublicFileUrlResponse,
} from '@app/files-grpc';
import type {
  CompleteImageUploadsRequest,
  CompleteImageUploadsResponse,
  EnsureCompletedImageUploadsRequest,
  EnsureCompletedImageUploadsResponse,
  InitiateImageUploadsRequest,
  InitiateImageUploadsResponse,
} from '@app/files-grpc';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CompleteImageUploadsCommand } from '../../application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { InitiateImageUploadsCommand } from '../../application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
import { FilesRpcExceptionFilter } from './filters/files-rpc-exception.filter.js';
import { EnsureCompletedImageUploadsQuery } from '../../application/use-cases/ensure-completed-image-uploads/ensure-completed-image-uploads.use-case.js';
import { GetPublicFileUrlQuery } from '../../application/use-cases/get-public-file-url/get-public-file-url.query-handler.js';

@Controller()
@FilesServiceControllerMethods()
@UseFilters(FilesRpcExceptionFilter)
export class FilesGrpcController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  initiateImageUploads(request: InitiateImageUploadsRequest): Promise<InitiateImageUploadsResponse> {
    return this.commandBus.execute(
      new InitiateImageUploadsCommand({
        userId: Number(request.userId),
        images: request.images,
      }),
    );
  }

  async completeImageUploads(request: CompleteImageUploadsRequest): Promise<CompleteImageUploadsResponse> {
    await this.commandBus.execute(
      new CompleteImageUploadsCommand({
        userId: Number(request.userId),
        uploadIds: request.uploadIds,
      }),
    );

    return {};
  }

  async ensureCompletedImageUploads(
    request: EnsureCompletedImageUploadsRequest,
  ): Promise<EnsureCompletedImageUploadsResponse> {
    await this.queryBus.execute(
      new EnsureCompletedImageUploadsQuery({
        userId: Number(request.userId),
        imageIds: request.imageIds,
      }),
    );

    return {};
  }
  async getPublicFileUrl(request: GetPublicFileUrlRequest): Promise<GetPublicFileUrlResponse> {
    return await this.queryBus.execute(new GetPublicFileUrlQuery(request.fileId));
  }
}
