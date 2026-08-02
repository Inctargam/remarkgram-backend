import {
  MAX_IMAGES_PER_UPLOAD_REQUEST,
  MAX_IMAGE_SIZE_BYTES,
  MIN_IMAGES_PER_UPLOAD_REQUEST,
  MIN_IMAGE_SIZE_BYTES,
} from '@app/files-grpc';
import { FilesError, FilesErrorCode } from '../../common/errors/files.error.js';

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

export class UnsupportedImageContentTypeError extends FilesError {
  readonly code = FilesErrorCode.UNSUPPORTED_IMAGE_CONTENT_TYPE;

  constructor(contentType: string) {
    super(`Unsupported image content type: ${contentType}`);
  }
}
