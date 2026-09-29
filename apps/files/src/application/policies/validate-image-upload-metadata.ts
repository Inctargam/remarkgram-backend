import { ImageContentType, MIN_IMAGE_SIZE_BYTES } from '@app/files-grpc';
import { InvalidImageSizeError, UnsupportedImageContentTypeError } from '../errors/image-upload.errors.js';
import type { ImageUploadMetadata } from '../types/image-upload.types.js';

const supportedImageContentTypes = new Set<string>(Object.values(ImageContentType));

export function validateImageUploadMetadata(image: ImageUploadMetadata, maxSizeBytes: number): void {
  if (!Number.isSafeInteger(image.size) || image.size < MIN_IMAGE_SIZE_BYTES || image.size > maxSizeBytes) {
    throw new InvalidImageSizeError(maxSizeBytes);
  }

  if (!supportedImageContentTypes.has(image.contentType)) {
    throw new UnsupportedImageContentTypeError(image.contentType);
  }
}
