import { MAX_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import { Logger } from '@nestjs/common';
import {
  DuplicateImageUploadIdError,
  ImageUploadMetadataMismatchError,
  ImageUploadNotFoundError,
  InvalidImageCountError,
  InvalidImageUploadStatusError,
  InvalidUserIdError,
} from '../../errors/image-upload.errors.js';
import {
  CompleteImageUploadsCommand,
  CompleteImageUploadsUseCase,
} from './complete-image-uploads.use-case.js';
import type { FilesRepository } from '../../ports/files.repository.js';
import type { ObjectStorage } from '../../ports/object-storage.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';

describe('CompleteImageUploadsUseCase', () => {
  const filesRepository = {
    createMany: vi.fn<FilesRepository['createMany']>(),
    findImageUploads: vi.fn<FilesRepository['findImageUploads']>(),
    updateImageUploadsStatusIfAllPending: vi.fn<FilesRepository['updateImageUploadsStatusIfAllPending']>(),
    reserveImageUploads: vi.fn<FilesRepository['reserveImageUploads']>(),
    attachReservedImageUploads: vi.fn<FilesRepository['attachReservedImageUploads']>(),
    releaseReservedImageUploads: vi.fn<FilesRepository['releaseReservedImageUploads']>(),
    claimExpiredImageUploads: vi.fn<FilesRepository['claimExpiredImageUploads']>(),
    deleteClaimedImageUpload: vi.fn<FilesRepository['deleteClaimedImageUpload']>(),
    deleteRejectedImageUploads: vi.fn<FilesRepository['deleteRejectedImageUploads']>(),
    findAvailableById: vi.fn<FilesRepository['findAvailableById']>(),
  };
  const objectStorage = {
    createPresignedUpload: vi.fn<ObjectStorage['createPresignedUpload']>(),
    getObjectMetadata: vi.fn<ObjectStorage['getObjectMetadata']>(),
    deleteObject: vi.fn<ObjectStorage['deleteObject']>(),
    getPublicUrl: vi.fn<ObjectStorage['getPublicUrl']>(),
  };
  const useCase = new CompleteImageUploadsUseCase(filesRepository, objectStorage);
  const uploadId = '11111111-1111-4111-8111-111111111111';
  const secondUploadId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    filesRepository.findImageUploads.mockReset();
    filesRepository.findImageUploads.mockResolvedValue([
      {
        id: uploadId,
        objectKey: `users/42/images/${uploadId}`,
        contentType: 'image/jpeg',
        size: 1_024,
        uploadStatus: FileUploadStatus.PENDING,
      },
    ]);
    filesRepository.updateImageUploadsStatusIfAllPending.mockReset();
    filesRepository.updateImageUploadsStatusIfAllPending.mockResolvedValue();
    filesRepository.deleteRejectedImageUploads.mockReset();
    filesRepository.deleteRejectedImageUploads.mockResolvedValue();
    objectStorage.getObjectMetadata.mockReset();
    objectStorage.getObjectMetadata.mockResolvedValue({
      size: 1_024,
      contentType: 'image/jpeg',
    });
    objectStorage.deleteObject.mockReset();
    objectStorage.deleteObject.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('marks all requested uploads as completed when their metadata matches', async () => {
    const uploadedAt = new Date('2030-01-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(uploadedAt);

    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
        }),
      ),
    ).resolves.toBeUndefined();

    expect(filesRepository.findImageUploads).toHaveBeenCalledWith({
      uploadIds: [uploadId],
      userId: 42,
    });
    expect(objectStorage.getObjectMetadata).toHaveBeenCalledWith(`users/42/images/${uploadId}`);
    expect(filesRepository.updateImageUploadsStatusIfAllPending).toHaveBeenCalledWith({
      uploadIds: [uploadId],
      userId: 42,
      uploadStatus: FileUploadStatus.COMPLETED,
      uploadedAt,
    });
  });

  it('marks all requested uploads as rejected when any metadata does not match', async () => {
    filesRepository.findImageUploads.mockResolvedValue([
      {
        id: uploadId,
        objectKey: `users/42/images/${uploadId}`,
        contentType: 'image/jpeg',
        size: 1_024,
        uploadStatus: FileUploadStatus.PENDING,
      },
      {
        id: secondUploadId,
        objectKey: `users/42/images/${secondUploadId}`,
        contentType: 'image/png',
        size: 2_048,
        uploadStatus: FileUploadStatus.PENDING,
      },
    ]);
    objectStorage.getObjectMetadata
      .mockResolvedValueOnce({ size: 1_024, contentType: 'image/jpeg' })
      .mockResolvedValueOnce({ size: 4_096, contentType: 'image/png' });

    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId, secondUploadId],
        }),
      ),
    ).rejects.toThrow(ImageUploadMetadataMismatchError);

    expect(filesRepository.updateImageUploadsStatusIfAllPending).toHaveBeenCalledOnce();
    expect(filesRepository.updateImageUploadsStatusIfAllPending).toHaveBeenCalledWith({
      uploadIds: [uploadId, secondUploadId],
      userId: 42,
      uploadStatus: FileUploadStatus.REJECTED,
      uploadedAt: null,
    });
    await vi.waitFor(() => {
      expect(objectStorage.deleteObject).toHaveBeenCalledWith(`users/42/images/${uploadId}`);
      expect(objectStorage.deleteObject).toHaveBeenCalledWith(`users/42/images/${secondUploadId}`);
      expect(filesRepository.deleteRejectedImageUploads).toHaveBeenCalledWith({
        uploadIds: [uploadId, secondUploadId],
        userId: 42,
      });
    });
  });

  it('leaves rejected records for scheduled cleanup when immediate S3 deletion fails', async () => {
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    objectStorage.getObjectMetadata.mockResolvedValue(null);
    objectStorage.deleteObject.mockRejectedValue(new Error('S3 is unavailable'));

    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
        }),
      ),
    ).rejects.toThrow(ImageUploadMetadataMismatchError);

    await vi.waitFor(() => {
      expect(loggerError).toHaveBeenCalledOnce();
    });
    expect(filesRepository.deleteRejectedImageUploads).not.toHaveBeenCalled();
  });

  it('does not change upload statuses when storage metadata cannot be requested', async () => {
    objectStorage.getObjectMetadata.mockRejectedValue(new Error('S3 is unavailable'));

    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
        }),
      ),
    ).rejects.toThrow('S3 is unavailable');
    expect(filesRepository.updateImageUploadsStatusIfAllPending).not.toHaveBeenCalled();
  });

  it('rejects all requested uploads when an object is missing from storage', async () => {
    objectStorage.getObjectMetadata.mockResolvedValue(null);

    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
        }),
      ),
    ).rejects.toThrow(ImageUploadMetadataMismatchError);
    expect(filesRepository.updateImageUploadsStatusIfAllPending).toHaveBeenCalledWith({
      uploadIds: [uploadId],
      userId: 42,
      uploadStatus: FileUploadStatus.REJECTED,
      uploadedAt: null,
    });
  });

  it('treats repeated completion of completed uploads as successful', async () => {
    filesRepository.findImageUploads.mockResolvedValue([
      {
        id: uploadId,
        objectKey: `users/42/images/${uploadId}`,
        contentType: 'image/jpeg',
        size: 1_024,
        uploadStatus: FileUploadStatus.COMPLETED,
      },
    ]);

    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
        }),
      ),
    ).resolves.toBeUndefined();
    expect(objectStorage.getObjectMetadata).not.toHaveBeenCalled();
    expect(filesRepository.updateImageUploadsStatusIfAllPending).not.toHaveBeenCalled();
  });

  it('rejects image uploads in incompatible statuses', async () => {
    filesRepository.findImageUploads.mockResolvedValue([
      {
        id: uploadId,
        objectKey: `users/42/images/${uploadId}`,
        contentType: 'image/jpeg',
        size: 1_024,
        uploadStatus: FileUploadStatus.REJECTED,
      },
    ]);

    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
        }),
      ),
    ).rejects.toThrow(InvalidImageUploadStatusError);
    expect(objectStorage.getObjectMetadata).not.toHaveBeenCalled();
    expect(filesRepository.updateImageUploadsStatusIfAllPending).not.toHaveBeenCalled();
  });

  it('rejects a concurrent status change without reporting success', async () => {
    filesRepository.updateImageUploadsStatusIfAllPending.mockRejectedValue(
      new InvalidImageUploadStatusError(),
    );

    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
        }),
      ),
    ).rejects.toThrow(InvalidImageUploadStatusError);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects an invalid user ID: %s', async (userId) => {
    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId,
          uploadIds: [uploadId],
        }),
      ),
    ).rejects.toThrow(InvalidUserIdError);
  });

  it.each([
    { uploadIds: [] },
    {
      uploadIds: Array.from({ length: MAX_IMAGES_PER_UPLOAD_REQUEST + 1 }, (_, index) => `upload-${index}`),
    },
  ])('rejects an invalid image upload count', async ({ uploadIds }) => {
    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds,
        }),
      ),
    ).rejects.toThrow(InvalidImageCountError);
  });

  it('rejects duplicate image upload IDs', async () => {
    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId, uploadId],
        }),
      ),
    ).rejects.toThrow(DuplicateImageUploadIdError);
  });

  it('rejects upload IDs that do not belong to the user', async () => {
    filesRepository.findImageUploads.mockResolvedValue([]);

    await expect(
      useCase.execute(
        new CompleteImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
        }),
      ),
    ).rejects.toThrow(ImageUploadNotFoundError);
    expect(objectStorage.getObjectMetadata).not.toHaveBeenCalled();
  });
});
