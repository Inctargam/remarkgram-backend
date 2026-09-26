import { Controller, UseFilters } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type {
  AttachAvatarUploadResponse,
  AttachAvatarUploadRequest,
  ScheduleAttachedFileDeletionRequest,
} from '@app/files-grpc';
import { AttachAvatarUploadCommand } from '../../application/use-cases/attach-avatar-upload/attach-avatar-upload.use-case.js';
import { ScheduleAttachedFileDeletionCommand } from '../../application/use-cases/schedule-attached-file-deletion/schedule-attached-file-deletion.use-case.js';
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
  InitiateAvatarUploadRequest,
  ImageUploadSession,
  ReleaseReservedImageUploadsRequest,
  ReleaseReservedImageUploadsResponse,
  ReserveImageUploadsRequest,
  ReserveImageUploadsResponse,
} from '@app/files-grpc';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AttachReservedImageUploadsCommand } from '../../application/use-cases/attach-reserved-image-uploads/attach-reserved-image-uploads.use-case.js';
import { CompleteImageUploadsCommand } from '../../application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { InitiateImageUploadsCommand } from '../../application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
import { InitiateAvatarUploadCommand } from '../../application/use-cases/initiate-avatar-upload/initiate-avatar-upload.use-case.js';
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

  async attachAvatarUpload(request: AttachAvatarUploadRequest): Promise<AttachAvatarUploadResponse> {
    if (!isUUID(request.fileId, '4') || !isUUID(request.operationId, '4')) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'fileId and operationId must be UUID v4',
      });
    }
    await this.commandBus.execute(
      new AttachAvatarUploadCommand({
        userId: Number(request.userId),
        fileId: request.fileId.toLowerCase(),
        operationId: request.operationId.toLowerCase(),
      }),
    );
    return {};
  }

  async scheduleAttachedFileDeletion(
    request: ScheduleAttachedFileDeletionRequest,
  ): Promise<Record<string, never>> {
    if (!isUUID(request.fileId, '4')) {
      throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'fileId must be a UUID v4' });
    }
    await this.commandBus.execute(
      new ScheduleAttachedFileDeletionCommand({
        userId: Number(request.userId),
        fileId: request.fileId.toLowerCase(),
      }),
    );
    return {};
  }

  initiateAvatarUpload(request: InitiateAvatarUploadRequest): Promise<ImageUploadSession> {
    return this.commandBus.execute(
      new InitiateAvatarUploadCommand({ ...request, userId: Number(request.userId) }),
    );
  }

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
      }),
    );

    return {};
  }

  async getFileDownloadUrl(request: GetFileDownloadUrlRequest): Promise<GetFileDownloadUrlResponse> {
    return await this.queryBus.execute(new GetFileDownloadUrlQuery(request.fileId));
  }
}
