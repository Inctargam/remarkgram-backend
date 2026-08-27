import {
  type AttachReservedImageUploadsRequest,
  type AttachReservedImageUploadsResponse,
  FILES_SERVICE_NAME,
  FilesErrorCode,
  type ReleaseReservedImageUploadsRequest,
  type ReleaseReservedImageUploadsResponse,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type ReserveImageUploadsRequest,
  type ReserveImageUploadsResponse,
} from '@app/files-grpc';
import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import { Metadata, status, type CallOptions, type ServiceError } from '@grpc/grpc-js';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import {
  ImageUploadsServiceUnavailableError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../application/errors/create-post.errors.js';
import { ImageUploadsGateway } from '../../application/ports/image-uploads.gateway.js';
import type {
  AttachReservedImageUploadsParams,
  ReleaseReservedImageUploadsParams,
  ReserveImageUploadsParams,
} from '../../application/types/posts.types.js';

const FILES_REQUEST_TIMEOUT_MS = 5_000;

// ts-proto does not include grpc-js CallOptions in the generated Nest client interface,
// although Nest forwards the second unary-method argument to grpc-js at runtime.
interface FilesImageUploadsClient {
  reserveImageUploads(
    request: ReserveImageUploadsRequest,
    options?: CallOptions,
  ): Observable<ReserveImageUploadsResponse>;
  attachReservedImageUploads(
    request: AttachReservedImageUploadsRequest,
    options?: CallOptions,
  ): Observable<AttachReservedImageUploadsResponse>;
  releaseReservedImageUploads(
    request: ReleaseReservedImageUploadsRequest,
    options?: CallOptions,
  ): Observable<ReleaseReservedImageUploadsResponse>;
}

function isServiceError(error: unknown): error is ServiceError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'number' &&
    'metadata' in error &&
    error.metadata instanceof Metadata
  );
}

@Injectable()
export class GrpcImageUploadsGateway extends ImageUploadsGateway implements OnModuleInit {
  private filesClient!: FilesImageUploadsClient;

  constructor(
    @Inject(REMARKGRAM_FILES_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
  ) {
    super();
  }

  onModuleInit(): void {
    this.filesClient = this.grpcClient.getService<FilesImageUploadsClient>(FILES_SERVICE_NAME);
  }

  async reserveImageUploads(params: ReserveImageUploadsParams): Promise<void> {
    await this.executeFilesRequest(() =>
      this.filesClient.reserveImageUploads(
        {
          userId: String(params.userId),
          uploadIds: [...params.imageIds],
          reservationId: params.reservationId,
        },
        this.createCallOptions(),
      ),
    );
  }

  async attachReservedImageUploads(params: AttachReservedImageUploadsParams): Promise<void> {
    await this.executeFilesRequest(() =>
      this.filesClient.attachReservedImageUploads(
        {
          userId: String(params.userId),
          reservationId: params.reservationId,
        },
        this.createCallOptions(),
      ),
    );
  }

  async releaseReservedImageUploads(params: ReleaseReservedImageUploadsParams): Promise<void> {
    await this.executeFilesRequest(() =>
      this.filesClient.releaseReservedImageUploads(
        {
          userId: String(params.userId),
          reservationId: params.reservationId,
        },
        this.createCallOptions(),
      ),
    );
  }

  private createCallOptions(): CallOptions {
    // grpc-js expects an absolute deadline rather than a timeout duration.
    return { deadline: new Date(Date.now() + FILES_REQUEST_TIMEOUT_MS) };
  }

  private async executeFilesRequest(request: () => Observable<unknown>): Promise<void> {
    try {
      await firstValueFrom(request());
    } catch (error) {
      if (!isServiceError(error)) {
        throw error;
      }

      if (error.code === status.UNAVAILABLE || error.code === status.DEADLINE_EXCEEDED) {
        throw new ImageUploadsServiceUnavailableError();
      }

      const filesErrorCode = error.metadata.get(APP_ERROR_CODE_METADATA_KEY).at(0)?.toString();

      if (error.code === status.NOT_FOUND && filesErrorCode === FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND) {
        throw new PostImageNotFoundError();
      }

      if (
        error.code === status.FAILED_PRECONDITION &&
        filesErrorCode === FilesErrorCode.IMAGE_UPLOADS_NOT_AVAILABLE
      ) {
        throw new PostImagesNotAvailableError();
      }

      throw error;
    }
  }
}
