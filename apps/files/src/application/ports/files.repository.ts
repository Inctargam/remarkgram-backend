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

export type ReserveImageUploadsRepositoryParams = ImageUploadsSelection & {
  reservationId: string;
};

export type ReservationParams = {
  userId: number;
  reservationId: string;
};

export type AttachImageUploadRepositoryParams = {
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
  abstract attachImageUpload(
    params: AttachImageUploadRepositoryParams,
    ctx: TransactionContext,
  ): Promise<ImageUploadMetadata | null>;

  abstract createMany(fileRecords: readonly CreateFileRecord[]): Promise<void>;

  abstract findImageUploads(params: ImageUploadsSelection): Promise<ImageUploadRecord[]>;

  abstract updateImageUploadsStatusIfAllPending(params: UpdateImageUploadsStatusParams): Promise<void>;
  abstract reserveImageUploads(params: ReserveImageUploadsRepositoryParams): Promise<void>;

  abstract attachReservedImageUploads(params: ReservationParams): Promise<void>;

  abstract releaseReservedImageUploads(params: ReservationParams): Promise<void>;

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
