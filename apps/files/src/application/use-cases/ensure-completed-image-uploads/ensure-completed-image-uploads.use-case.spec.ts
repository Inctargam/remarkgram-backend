import { MAX_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import {
  DuplicateImageUploadIdError,
  ImageUploadNotFoundError,
  ImageUploadsNotCompletedError,
  InvalidImageCountError,
  InvalidUserIdError,
} from '../../errors/image-upload.errors.js';
import type { FilesRepository } from '../../ports/files.repository.js';
import {
  EnsureCompletedImageUploadsQuery,
  EnsureCompletedImageUploadsUseCase,
} from './ensure-completed-image-uploads.use-case.js';

describe('EnsureCompletedImageUploadsUseCase', () => {
  const firstImageId = '11111111-1111-4111-8111-111111111111';
  const secondImageId = '22222222-2222-4222-8222-222222222222';
  const filesRepository = {
    findImageUploads: vi.fn<FilesRepository['findImageUploads']>(),
  };
  const useCase = new EnsureCompletedImageUploadsUseCase(filesRepository as unknown as FilesRepository);

  beforeEach(() => {
    filesRepository.findImageUploads.mockReset();
    filesRepository.findImageUploads.mockResolvedValue([
      {
        id: firstImageId,
        objectKey: `users/42/images/${firstImageId}`,
        contentType: 'image/jpeg',
        size: 1_024,
        uploadStatus: FileUploadStatus.COMPLETED,
      },
    ]);
  });

  it('accepts completed images owned by the user', async () => {
    await expect(
      useCase.execute(new EnsureCompletedImageUploadsQuery({ userId: 42, imageIds: [firstImageId] })),
    ).resolves.toBeUndefined();

    expect(filesRepository.findImageUploads).toHaveBeenCalledWith({
      uploadIds: [firstImageId],
      userId: 42,
    });
  });

  it('rejects images that are missing, foreign or soft-deleted', async () => {
    filesRepository.findImageUploads.mockResolvedValue([]);

    await expect(
      useCase.execute(new EnsureCompletedImageUploadsQuery({ userId: 42, imageIds: [firstImageId] })),
    ).rejects.toBeInstanceOf(ImageUploadNotFoundError);
  });

  it.each([FileUploadStatus.PENDING, FileUploadStatus.REJECTED])(
    'rejects an image with %s upload status',
    async (uploadStatus) => {
      filesRepository.findImageUploads.mockResolvedValue([
        {
          id: firstImageId,
          objectKey: `users/42/images/${firstImageId}`,
          contentType: 'image/jpeg',
          size: 1_024,
          uploadStatus,
        },
      ]);

      await expect(
        useCase.execute(new EnsureCompletedImageUploadsQuery({ userId: 42, imageIds: [firstImageId] })),
      ).rejects.toBeInstanceOf(ImageUploadsNotCompletedError);
    },
  );

  it('rejects mixed completed and pending statuses', async () => {
    filesRepository.findImageUploads.mockResolvedValue([
      {
        id: firstImageId,
        objectKey: `users/42/images/${firstImageId}`,
        contentType: 'image/jpeg',
        size: 1_024,
        uploadStatus: FileUploadStatus.COMPLETED,
      },
      {
        id: secondImageId,
        objectKey: `users/42/images/${secondImageId}`,
        contentType: 'image/png',
        size: 2_048,
        uploadStatus: FileUploadStatus.PENDING,
      },
    ]);

    await expect(
      useCase.execute(
        new EnsureCompletedImageUploadsQuery({
          userId: 42,
          imageIds: [firstImageId, secondImageId],
        }),
      ),
    ).rejects.toBeInstanceOf(ImageUploadsNotCompletedError);
  });

  it.each([0, -1, Number.NaN, 1.5])('rejects invalid user ID %s', async (userId) => {
    await expect(
      useCase.execute(new EnsureCompletedImageUploadsQuery({ userId, imageIds: [firstImageId] })),
    ).rejects.toBeInstanceOf(InvalidUserIdError);
  });

  it.each([
    { imageIds: [] },
    {
      imageIds: Array.from({ length: MAX_IMAGES_PER_UPLOAD_REQUEST + 1 }, (_, index) => `image-${index}`),
    },
  ])('rejects an invalid image count', async ({ imageIds }) => {
    await expect(
      useCase.execute(new EnsureCompletedImageUploadsQuery({ userId: 42, imageIds })),
    ).rejects.toBeInstanceOf(InvalidImageCountError);
  });

  it('rejects duplicate image IDs', async () => {
    await expect(
      useCase.execute(
        new EnsureCompletedImageUploadsQuery({
          userId: 42,
          imageIds: [firstImageId, firstImageId],
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateImageUploadIdError);
  });
});
