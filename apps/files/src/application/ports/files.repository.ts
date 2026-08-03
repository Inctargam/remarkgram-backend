import type { FileUploadStatus } from '../../domain/enums/file-upload-status.enum.js';

export type FileRecord = {
  id: string;
  userId: number;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  size: number;
  uploadStatus: FileUploadStatus;
  uploadExpiresAt: Date;
  uploadedAt: Date | null;
};

export abstract class FilesRepository {
  abstract createMany(fileRecords: readonly FileRecord[]): Promise<void>;
}
