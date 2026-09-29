import type { AttachPostImagesRequest, CancelPostImageAttachmentRequest } from '@app/files-grpc';
import { AttachPostImagesCommand } from '../../application/use-cases/attach-post-images/attach-post-images.use-case.js';
import { CancelPostImageAttachmentCommand } from '../../application/use-cases/cancel-post-image-attachment/cancel-post-image-attachment.use-case.js';
import { Controller, UseFilters } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type {
  AttachAvatarFileResponse,
  AttachAvatarFileRequest,
  ScheduleAttachedFileDeletionRequest,
} from '@app/files-grpc';
import { AttachAvatarFileCommand } from '../../application/use-cases/attach-avatar-file/attach-avatar-file.use-case.js';
import { ScheduleAttachedFileDeletionCommand } from '../../application/use-cases/schedule-attached-file-deletion/schedule-attached-file-deletion.use-case.js';
import { FilesServiceControllerMethods } from '@app/files-grpc';
import type {
  CompleteImageUploadsRequest,
  CompleteImageUploadsResponse,
  GetFileDownloadUrlRequest,
  GetFileDownloadUrlResponse,
  InitiateImageUploadsRequest,
  InitiateImageUploadsResponse,
  InitiateAvatarUploadRequest,
  ImageUploadSession,
} from '@app/files-grpc';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CompleteImageUploadsCommand } from '../../application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { InitiateImageUploadsCommand } from '../../application/use-cases/initiate-image-uploads/initiate-image-uploads.use-case.js';
import { InitiateAvatarUploadCommand } from '../../application/use-cases/initiate-avatar-upload/initiate-avatar-upload.use-case.js';
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

  async attachAvatarFile(request: AttachAvatarFileRequest): Promise<AttachAvatarFileResponse> {
    if (!isUUID(request.fileId, '4') || !isUUID(request.operationId, '4')) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'fileId and operationId must be UUID v4',
      });
    }
    await this.commandBus.execute(
      new AttachAvatarFileCommand({
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

  async attachPostImages(request: AttachPostImagesRequest): Promise<Record<string, never>> {
    await this.commandBus.execute(new AttachPostImagesCommand(this.parseAttachmentRequest(request)));
    return {};
  }

  async cancelPostImageAttachment(request: CancelPostImageAttachmentRequest): Promise<Record<string, never>> {
    await this.commandBus.execute(new CancelPostImageAttachmentCommand(this.parseAttachmentRequest(request)));
    return {};
  }

  private parseAttachmentRequest(request: AttachPostImagesRequest) {
    if (!isUUID(request.operationId, '4') || !request.fileIds.every((id) => isUUID(id, '4'))) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'fileIds and operationId must be UUID v4',
      });
    }
    return {
      userId: Number(request.userId),
      fileIds: request.fileIds.map((id) => id.toLowerCase()),
      operationId: request.operationId.toLowerCase(),
    };
  }

  async getFileDownloadUrl(request: GetFileDownloadUrlRequest): Promise<GetFileDownloadUrlResponse> {
    return await this.queryBus.execute(new GetFileDownloadUrlQuery(request.fileId));
  }
}
