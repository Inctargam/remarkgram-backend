import {
  FilesErrorCode,
  MAX_IMAGES_PER_UPLOAD_REQUEST,
  MAX_IMAGE_SIZE_BYTES,
  MIN_IMAGES_PER_UPLOAD_REQUEST,
  MIN_IMAGE_SIZE_BYTES,
} from '@app/files-grpc';
import { FilesError } from './files.error.js';

export class InvalidUserIdError extends FilesError {
  readonly code = FilesErrorCode.INVALID_USER_ID;

  constructor() {
    super('User ID must be a positive integer');
  }
}

export class InvalidImageCountError extends FilesError {
  readonly code = FilesErrorCode.INVALID_IMAGE_COUNT;

  constructor() {
    super(
      `Image count must be between ${MIN_IMAGES_PER_UPLOAD_REQUEST} and ${MAX_IMAGES_PER_UPLOAD_REQUEST}`,
    );
  }
}

export class InvalidImageSizeError extends FilesError {
  readonly code = FilesErrorCode.INVALID_IMAGE_SIZE;

  constructor() {
    super(`Image size must be between ${MIN_IMAGE_SIZE_BYTES} and ${MAX_IMAGE_SIZE_BYTES} bytes`);
  }
}

export class DuplicateClientFileIdError extends FilesError {
  readonly code = FilesErrorCode.DUPLICATE_CLIENT_FILE_ID;

  constructor(clientFileId: string) {
    super(`Duplicate client file ID: ${clientFileId}`);
  }
}

export class DuplicateImageUploadIdError extends FilesError {
  readonly code = FilesErrorCode.DUPLICATE_IMAGE_UPLOAD_ID;

  constructor() {
    super('Image upload IDs must be unique');
  }
}

export class ImageUploadNotFoundError extends FilesError {
  readonly code = FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND;

  constructor() {
    super('One or more image uploads were not found');
  }
}

export class ImageUploadsNotAvailableError extends FilesError {
  readonly code = FilesErrorCode.IMAGE_UPLOADS_NOT_AVAILABLE;

  constructor() {
    super('One or more image uploads are not available for this operation');
  }
}

export class ImageUploadReservationConflictError extends FilesError {
  readonly code = FilesErrorCode.IMAGE_UPLOAD_RESERVATION_CONFLICT;

  constructor() {
    super('Image upload reservation conflicts with an existing reservation');
  }
}

export class InvalidImageUploadStatusError extends FilesError {
  readonly code = FilesErrorCode.INVALID_IMAGE_UPLOAD_STATUS;

  constructor() {
    super('Image uploads must be either all pending or all completed');
  }
}

export class ImageUploadMetadataMismatchError extends FilesError {
  readonly code = FilesErrorCode.IMAGE_UPLOAD_METADATA_MISMATCH;

  constructor() {
    super('One or more uploaded images do not match the expected metadata');
  }
}

export class UnsupportedImageContentTypeError extends FilesError {
  readonly code = FilesErrorCode.UNSUPPORTED_IMAGE_CONTENT_TYPE;

  constructor(contentType: string) {
    super(`Unsupported image content type: ${contentType}`);
  }
}
