import { Metadata, type CallOptions, type ServiceError, status } from '@grpc/grpc-js';
import {
  FILES_APP_ERROR_CODE_METADATA_KEY,
  FILES_SERVICE_NAME,
  FilesErrorCode,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type EnsureCompletedImageUploadsRequest,
  type EnsureCompletedImageUploadsResponse,
} from '@app/files-grpc';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import {
  ImageUploadsServiceUnavailableError,
  PostImageNotCompletedError,
  PostImageNotFoundError,
} from '../../application/errors/create-post.errors.js';
import { ImageUploadsVerifier } from '../../application/ports/image-uploads-verifier.js';
import type { EnsureCompletedImagesParams } from '../../application/types/posts.types.js';

const FILES_REQUEST_TIMEOUT_MS = 5_000;

// Nest передаёт второй аргумент unary-метода напрямую в grpc-js. В generated-интерфейсе
// ts-proto CallOptions отсутствует, поэтому описываем только реально используемый RPC.
interface FilesImageUploadsClient {
  ensureCompletedImageUploads(
    request: EnsureCompletedImageUploadsRequest,
    options?: CallOptions,
  ): Observable<EnsureCompletedImageUploadsResponse>;
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
export class FilesImageUploadsVerifier extends ImageUploadsVerifier implements OnModuleInit {
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

  async ensureCompleted(params: EnsureCompletedImagesParams): Promise<void> {
    try {
      await firstValueFrom(
        this.filesClient.ensureCompletedImageUploads(
          {
            userId: String(params.userId),
            imageIds: [...params.imageIds],
          },
          {
            // grpc-js ожидает абсолютный момент завершения, а не длительность таймаута.
            deadline: new Date(Date.now() + FILES_REQUEST_TIMEOUT_MS),
          },
        ),
      );
    } catch (error) {
      if (!isServiceError(error)) {
        throw error;
      }

      if (error.code === status.UNAVAILABLE || error.code === status.DEADLINE_EXCEEDED) {
        throw new ImageUploadsServiceUnavailableError();
      }

      const filesErrorCode = error.metadata.get(FILES_APP_ERROR_CODE_METADATA_KEY).at(0)?.toString();

      if (error.code === status.NOT_FOUND && filesErrorCode === FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND) {
        throw new PostImageNotFoundError();
      }

      if (
        error.code === status.FAILED_PRECONDITION &&
        filesErrorCode === FilesErrorCode.IMAGE_UPLOADS_NOT_COMPLETED
      ) {
        throw new PostImageNotCompletedError();
      }

      throw error;
    }
  }
}
