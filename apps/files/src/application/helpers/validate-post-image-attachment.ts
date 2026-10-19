import { MAX_IMAGES_PER_UPLOAD_REQUEST, MIN_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import {
  DuplicateImageUploadIdError,
  InvalidImageCountError,
  InvalidUserIdError,
} from '../errors/image-upload.errors.js';
import type { PostImageAttachmentParams } from '../ports/files.repository.js';

export function validatePostImageAttachment({ userId, fileIds }: PostImageAttachmentParams): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new InvalidUserIdError();
  if (fileIds.length < MIN_IMAGES_PER_UPLOAD_REQUEST || fileIds.length > MAX_IMAGES_PER_UPLOAD_REQUEST) {
    throw new InvalidImageCountError();
  }
  if (new Set(fileIds).size !== fileIds.length) throw new DuplicateImageUploadIdError();
}
