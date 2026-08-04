import { MAX_IMAGES_PER_UPLOAD_REQUEST, MIN_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import {
  DuplicateImageUploadIdError,
  ImageUploadNotFoundError,
  ImageUploadsNotCompletedError,
  InvalidImageCountError,
  InvalidUserIdError,
} from '../../errors/image-upload.errors.js';
import { FilesRepository } from '../../ports/files.repository.js';

const MAX_USER_ID = 2_147_483_647;

export type EnsureCompletedImageUploadsParams = {
  userId: number;
  imageIds: readonly string[];
};

export class EnsureCompletedImageUploadsQuery extends Query<void> {
  constructor(public readonly params: EnsureCompletedImageUploadsParams) {
    super();
  }
}

@QueryHandler(EnsureCompletedImageUploadsQuery)
export class EnsureCompletedImageUploadsUseCase implements IQueryHandler<EnsureCompletedImageUploadsQuery> {
  constructor(private readonly filesRepository: FilesRepository) {}

  async execute(query: EnsureCompletedImageUploadsQuery): Promise<void> {
    const { userId, imageIds } = query.params;

    if (!Number.isSafeInteger(userId) || userId <= 0 || userId > MAX_USER_ID) {
      throw new InvalidUserIdError();
    }

    if (imageIds.length < MIN_IMAGES_PER_UPLOAD_REQUEST || imageIds.length > MAX_IMAGES_PER_UPLOAD_REQUEST) {
      throw new InvalidImageCountError();
    }

    if (new Set(imageIds).size !== imageIds.length) {
      throw new DuplicateImageUploadIdError();
    }

    const fileRecords = await this.filesRepository.findImageUploads({
      uploadIds: imageIds,
      userId,
    });

    if (fileRecords.length !== imageIds.length) {
      throw new ImageUploadNotFoundError();
    }

    if (fileRecords.some(({ uploadStatus }) => uploadStatus !== FileUploadStatus.COMPLETED)) {
      throw new ImageUploadsNotCompletedError();
    }
  }
}
