import {
  FILES_SERVICE_NAME,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type FilesServiceClient,
} from '@app/files-grpc';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ImageUploadsGateway } from '../../application/ports/image-uploads.gateway.js';
import type {
  AttachReservedImageUploadsParams,
  ReleaseReservedImageUploadsParams,
  ReserveImageUploadsParams,
} from '../../application/types/posts.types.js';
import { mapFilesError } from './files-error.mapper.js';

@Injectable()
export class GrpcImageUploadsGateway extends ImageUploadsGateway implements OnModuleInit {
  private filesClient!: FilesServiceClient;

  constructor(
    @Inject(REMARKGRAM_FILES_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
  ) {
    super();
  }

  onModuleInit(): void {
    this.filesClient = this.grpcClient.getService<FilesServiceClient>(FILES_SERVICE_NAME);
  }

  async reserveImageUploads(params: ReserveImageUploadsParams): Promise<void> {
    try {
      await firstValueFrom(
        this.filesClient.reserveImageUploads({
          userId: String(params.userId),
          uploadIds: [...params.imageIds],
          reservationId: params.reservationId,
        }),
      );
    } catch (error) {
      throw mapFilesError(error);
    }
  }

  async attachReservedImageUploads(params: AttachReservedImageUploadsParams): Promise<void> {
    try {
      await firstValueFrom(
        this.filesClient.attachReservedImageUploads({
          userId: String(params.userId),
          reservationId: params.reservationId,
        }),
      );
    } catch (error) {
      throw mapFilesError(error);
    }
  }

  async releaseReservedImageUploads(params: ReleaseReservedImageUploadsParams): Promise<void> {
    try {
      await firstValueFrom(
        this.filesClient.releaseReservedImageUploads({
          userId: String(params.userId),
          reservationId: params.reservationId,
        }),
      );
    } catch (error) {
      throw mapFilesError(error);
    }
  }
}
