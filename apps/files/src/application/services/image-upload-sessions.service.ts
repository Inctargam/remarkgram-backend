import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { filesConfig } from '../../config/files.config.js';
import { FileUploadStatus } from '../../domain/enums/file-upload-status.enum.js';
import { FilesRepository, type CreateFileRecord } from '../ports/files.repository.js';
import { ObjectStorage } from '../ports/object-storage.js';
import type { ImageUploadMetadataInput, ImageUploadSession } from '../types/image-upload.types.js';

@Injectable()
export class ImageUploadSessionsService {
  constructor(
    private readonly objectStorage: ObjectStorage,
    private readonly filesRepository: FilesRepository,
    @Inject(filesConfig.KEY) private readonly config: ConfigType<typeof filesConfig>,
  ) {}

  // Вызывается после проверки всего набора метаданных соответствующим use case.
  async create(userId: number, images: readonly ImageUploadMetadataInput[]): Promise<ImageUploadSession[]> {
    const sessions: ImageUploadSession[] = [];
    const fileRecords: CreateFileRecord[] = [];

    for (const image of images) {
      const { clientFileId, originalFilename, contentType, size } = image;
      const id = randomUUID();
      const objectKey = `users/${userId}/images/${id}`;
      const { url, fields, expiresAt } = await this.objectStorage.createPresignedUpload({
        objectKey,
        contentType,
        size,
        expiresInSeconds: this.config.s3.uploadUrlExpiresInSeconds,
      });

      sessions.push({ id, clientFileId, url, fields });
      fileRecords.push({
        id,
        userId,
        objectKey,
        originalFilename,
        contentType,
        size,
        uploadStatus: FileUploadStatus.PENDING,
        uploadExpiresAt: expiresAt,
      });
    }

    await this.filesRepository.createMany(fileRecords);
    return sessions;
  }
}
