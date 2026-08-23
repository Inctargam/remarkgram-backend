import type { FileUploadStatus } from '../../domain/enums/file-upload-status.enum.js';

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

export type FindImageUploadsParams = {
  uploadIds: readonly string[];
  userId: number;
};

export type UpdateImageUploadsStatusParams = FindImageUploadsParams & {
  uploadStatus: FileUploadStatus;
  uploadedAt: Date | null;
};

export type ReserveImageUploadsRepositoryParams = FindImageUploadsParams & {
  reservationId: string;
  operationId: string;
  reservationExpiresAt: Date;
};

export type ReleaseReservedImageUploadsRepositoryParams = {
  userId: number;
  reservationId: string;
  operationId: string;
};

export type AttachReservedImageUploadsRepositoryParams = ReleaseReservedImageUploadsRepositoryParams;

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

export type DeleteRejectedImageUploadsParams = FindImageUploadsParams;

export type FindAvailableByIdRepositoryParams = {
  id: string;
};

export type FindAvailableByIdRepositoryResult = {
  id: string;
  userId: number;
  objectKey: string;
} | null;

export abstract class FilesRepository {
  abstract createMany(fileRecords: readonly CreateFileRecord[]): Promise<void>;

  abstract findImageUploads(params: FindImageUploadsParams): Promise<ImageUploadRecord[]>;

  abstract updateImageUploadsStatusIfAllPending(params: UpdateImageUploadsStatusParams): Promise<void>;
  abstract reserveImageUploads(params: ReserveImageUploadsRepositoryParams): Promise<void>;

  abstract attachReservedImageUploads(params: AttachReservedImageUploadsRepositoryParams): Promise<void>;

  abstract releaseReservedImageUploads(params: ReleaseReservedImageUploadsRepositoryParams): Promise<void>;

  abstract claimExpiredImageUploads(params: ClaimExpiredImageUploadsParams): Promise<ClaimedImageUpload[]>;

  abstract deleteClaimedImageUpload(params: DeleteClaimedImageUploadParams): Promise<boolean>;

  abstract deleteRejectedImageUploads(params: DeleteRejectedImageUploadsParams): Promise<void>;

  abstract findAvailableById(
    params: FindAvailableByIdRepositoryParams,
  ): Promise<FindAvailableByIdRepositoryResult>;
}
