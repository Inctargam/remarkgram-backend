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
  abstract findAvailableById(
    params: FindAvailableByIdRepositoryParams,
  ): Promise<FindAvailableByIdRepositoryResult>;
}
