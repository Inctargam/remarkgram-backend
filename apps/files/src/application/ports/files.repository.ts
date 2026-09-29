import type { FileUploadStatus } from '../../domain/enums/file-upload-status.enum.js';
import type { ImageUploadMetadata } from '../types/image-upload.types.js';
import type { TransactionContext } from './unit-of-work.js';

export type CreateFileRecord = {
  id: string;
  userId: number;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  size: number;
  uploadStatus: FileUploadStatus;
  uploadExpiresAt: Date;
};

export type ImageUploadRecord = {
  id: string;
  objectKey: string;
  contentType: string;
  size: number;
  uploadStatus: FileUploadStatus;
};

export type ImageUploadsSelection = {
  uploadIds: readonly string[];
  userId: number;
};

export type UpdateImageUploadsStatusParams = ImageUploadsSelection & {
  uploadStatus: FileUploadStatus;
  uploadedAt: Date | null;
};

export type PostImageAttachmentParams = {
  userId: number;
  fileIds: readonly string[];
  operationId: string;
};

export type AttachAvatarFileRepositoryParams = {
  userId: number;
  fileId: string;
  operationId: string;
};

export type ClaimExpiredImageUploadsParams = {
  pendingExpiredBefore: Date;
  completedBefore: Date;
  rejectedBefore: Date;
  retryBefore: Date;
  claimedAt: Date;
  limit: number;
};

export type ClaimedImageUpload = {
  id: string;
  objectKey: string;
};

export type DeleteClaimedImageUploadParams = {
  uploadId: string;
  claimedAt: Date;
};

export type FindAvailableByIdRepositoryParams = {
  id: string;
};

export type FindAvailableByIdRepositoryResult = {
  id: string;
  userId: number;
  objectKey: string;
} | null;

export type SoftDeleteFileIdsByUserRepositoryResult = {
  id: string;
  objectKey: string;
  deletedAt: Date | null;
}[];
export abstract class FilesRepository {
  /** Прикрепляет COMPLETED-файл в текущей транзакции. null — точный повтор операции. */
  abstract attachAvatarFile(
    params: AttachAvatarFileRepositoryParams,
    ctx: TransactionContext,
  ): Promise<ImageUploadMetadata | null>;

  abstract createMany(fileRecords: readonly CreateFileRecord[]): Promise<void>;

  abstract findImageUploads(params: ImageUploadsSelection): Promise<ImageUploadRecord[]>;

  // Частичный переход откатывается; повтор подтверждения всего набора COMPLETED успешен.
  abstract updateImageUploadsStatusIfAllPending(params: UpdateImageUploadsStatusParams): Promise<void>;
  abstract attachPostImages(params: PostImageAttachmentParams): Promise<void>;

  abstract cancelPostImageAttachment(params: PostImageAttachmentParams): Promise<void>;

  abstract claimExpiredImageUploads(params: ClaimExpiredImageUploadsParams): Promise<ClaimedImageUpload[]>;

  abstract deleteClaimedImageUpload(params: DeleteClaimedImageUploadParams): Promise<boolean>;

  abstract deleteRejectedImageUploads(params: ImageUploadsSelection): Promise<void>;

  abstract findAvailableById(
    params: FindAvailableByIdRepositoryParams,
  ): Promise<FindAvailableByIdRepositoryResult>;

  abstract softDeleteFileIdsByUser(
    fileIds: string[],
    userId: number,
    ctx?: TransactionContext,
  ): Promise<SoftDeleteFileIdsByUserRepositoryResult>;

  abstract hardDeleteSoftDeletedById(fileId: string, ctx?: TransactionContext): Promise<void>;

  abstract softDeleteAttachedFile(
    fileId: string,
    userId: number,
    ctx: TransactionContext,
  ): Promise<SoftDeleteFileIdsByUserRepositoryResult>;
}
