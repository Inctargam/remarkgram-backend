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

export abstract class FilesRepository {
  abstract createMany(fileRecords: readonly CreateFileRecord[]): Promise<void>;
}
