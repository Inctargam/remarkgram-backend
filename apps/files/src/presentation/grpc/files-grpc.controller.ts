import { Controller, UseFilters } from '@nestjs/common';
import { FilesServiceControllerMethods } from '@app/files-grpc';
import type {
  AttachReservedImageUploadsRequest,
  AttachReservedImageUploadsResponse,
  CompleteImageUploadsRequest,
  CompleteImageUploadsResponse,
  GetFileDownloadUrlRequest,
  GetFileDownloadUrlResponse,
  InitiateImageUploadsRequest,
  InitiateImageUploadsResponse,
  ReleaseReservedImageUploadsRequest,
  ReleaseReservedImageUploadsResponse,
  ReserveImageUploadsRequest,
  ReserveImageUploadsResponse,
} from '@app/files-grpc';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AttachReservedImageUploadsCommand } from '../../application/use-cases/attach-reserved-image-uploads/attach-reserved-image-uploads.use-case.js';
import { CompleteImageUploadsCommand } from '../../application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { InitiateImageUploadsCommand } from '../../application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
import { ReleaseReservedImageUploadsCommand } from '../../application/use-cases/release-reserved-image-uploads/release-reserved-image-uploads.use-case.js';
import { ReserveImageUploadsCommand } from '../../application/use-cases/reserve-image-uploads/reserve-image-uploads.use-case.js';
import { GetFileDownloadUrlQuery } from '../../application/use-cases/get-public-file-url/get-public-file-url.query-handler.js';
import { FilesRpcExceptionFilter } from './filters/files-rpc-exception.filter.js';

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

  async reserveImageUploads(request: ReserveImageUploadsRequest): Promise<ReserveImageUploadsResponse> {
    await this.commandBus.execute(
      new ReserveImageUploadsCommand({
        userId: Number(request.userId),
        uploadIds: request.uploadIds,
        reservationId: request.reservationId,
        operationId: request.operationId,
      }),
    );

    return {};
  }

  async releaseReservedImageUploads(
    request: ReleaseReservedImageUploadsRequest,
  ): Promise<ReleaseReservedImageUploadsResponse> {
    await this.commandBus.execute(
      new ReleaseReservedImageUploadsCommand({
        userId: Number(request.userId),
        reservationId: request.reservationId,
        operationId: request.operationId,
      }),
    );

    return {};
  }

  async attachReservedImageUploads(
    request: AttachReservedImageUploadsRequest,
  ): Promise<AttachReservedImageUploadsResponse> {
    await this.commandBus.execute(
      new AttachReservedImageUploadsCommand({
        userId: Number(request.userId),
        reservationId: request.reservationId,
        operationId: request.operationId,
      }),
    );

    return {};
  }

  async getFileDownloadUrl(request: GetFileDownloadUrlRequest): Promise<GetFileDownloadUrlResponse> {
    return await this.queryBus.execute(new GetFileDownloadUrlQuery(request.fileId));
  }
}
