import { FilesErrorCode } from '@app/files-grpc';
import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import { Metadata, status, type ServiceError } from '@grpc/grpc-js';
import {
  ImageUploadsServiceUnavailableError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../application/errors/create-post.errors.js';

function isServiceError(error: unknown): error is ServiceError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'number' &&
    'metadata' in error &&
    error.metadata instanceof Metadata
  );
}

export function mapFilesError(error: unknown): unknown {
  if (!isServiceError(error)) return error;

  if (error.code === status.UNAVAILABLE || error.code === status.DEADLINE_EXCEEDED) {
    return new ImageUploadsServiceUnavailableError();
  }

  const filesErrorCode = error.metadata.get(APP_ERROR_CODE_METADATA_KEY).at(0)?.toString();

  if (error.code === status.NOT_FOUND && filesErrorCode === FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND) {
    return new PostImageNotFoundError();
  }

  if (
    error.code === status.FAILED_PRECONDITION &&
    filesErrorCode === FilesErrorCode.IMAGE_UPLOAD_STATE_CONFLICT
  ) {
    return new PostImagesNotAvailableError();
  }

  return error;
}
