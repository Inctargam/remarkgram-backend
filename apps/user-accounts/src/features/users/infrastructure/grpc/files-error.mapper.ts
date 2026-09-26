import { FilesErrorCode } from '@app/files-grpc';
import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import { Metadata, status, type ServiceError } from '@grpc/grpc-js';
import {
  AvatarFileStateConflictError,
  AvatarFileNotFoundError,
  AvatarFilesUnavailableError,
  InvalidAvatarImageError,
} from '../../application/errors/avatar.errors.js';

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
    return new AvatarFilesUnavailableError();
  }

  const filesErrorCode = error.metadata.get(APP_ERROR_CODE_METADATA_KEY).at(0)?.toString();

  if (error.code === status.NOT_FOUND && filesErrorCode === FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND) {
    return new AvatarFileNotFoundError();
  }

  if (
    error.code === status.FAILED_PRECONDITION &&
    filesErrorCode === FilesErrorCode.IMAGE_UPLOAD_STATE_CONFLICT
  ) {
    return new AvatarFileStateConflictError();
  }

  if (
    error.code === status.ALREADY_EXISTS &&
    filesErrorCode === FilesErrorCode.IMAGE_UPLOAD_RESERVATION_CONFLICT
  ) {
    return new AvatarFileStateConflictError();
  }

  if (
    error.code === status.INVALID_ARGUMENT &&
    (filesErrorCode === FilesErrorCode.INVALID_IMAGE_SIZE ||
      filesErrorCode === FilesErrorCode.UNSUPPORTED_IMAGE_CONTENT_TYPE)
  ) {
    return new InvalidAvatarImageError();
  }

  return error;
}
