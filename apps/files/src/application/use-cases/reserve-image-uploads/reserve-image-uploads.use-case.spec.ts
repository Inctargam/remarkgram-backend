import { MAX_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import {
  DuplicateImageUploadIdError,
  ImageUploadNotFoundError,
  ImageUploadsNotAvailableError,
  InvalidImageCountError,
  InvalidUserIdError,
} from '../../errors/image-upload.errors.js';
import type { FilesRepository } from '../../ports/files.repository.js';
import { ReserveImageUploadsCommand, ReserveImageUploadsUseCase } from './reserve-image-uploads.use-case.js';

describe('ReserveImageUploadsUseCase', () => {
  const filesRepository = {
    reserveImageUploads: vi.fn<FilesRepository['reserveImageUploads']>(),
  };
  const useCase = new ReserveImageUploadsUseCase(filesRepository as unknown as FilesRepository);
  const uploadId = '11111111-1111-4111-8111-111111111111';
  const reservationId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    filesRepository.reserveImageUploads.mockReset();
    filesRepository.reserveImageUploads.mockResolvedValue();
  });

  it('reserves image uploads through the repository', async () => {
    await expect(
      useCase.execute(
        new ReserveImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
          reservationId,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(filesRepository.reserveImageUploads).toHaveBeenCalledWith({
      userId: 42,
      uploadIds: [uploadId],
      reservationId,
    });
  });

  it('reports missing image uploads', async () => {
    filesRepository.reserveImageUploads.mockRejectedValue(new ImageUploadNotFoundError());

    await expect(
      useCase.execute(new ReserveImageUploadsCommand({ userId: 42, uploadIds: [uploadId], reservationId })),
    ).rejects.toThrow(ImageUploadNotFoundError);
  });

  it('reports image uploads unavailable for reservation', async () => {
    filesRepository.reserveImageUploads.mockRejectedValue(new ImageUploadsNotAvailableError());

    await expect(
      useCase.execute(new ReserveImageUploadsCommand({ userId: 42, uploadIds: [uploadId], reservationId })),
    ).rejects.toThrow(ImageUploadsNotAvailableError);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects an invalid user ID: %s', async (userId) => {
    await expect(
      useCase.execute(new ReserveImageUploadsCommand({ userId, uploadIds: [uploadId], reservationId })),
    ).rejects.toThrow(InvalidUserIdError);
    expect(filesRepository.reserveImageUploads).not.toHaveBeenCalled();
  });

  it.each([
    { uploadIds: [] },
    {
      uploadIds: Array.from({ length: MAX_IMAGES_PER_UPLOAD_REQUEST + 1 }, (_, index) => `upload-${index}`),
    },
  ])('rejects an invalid image upload count', async ({ uploadIds }) => {
    await expect(
      useCase.execute(new ReserveImageUploadsCommand({ userId: 42, uploadIds, reservationId })),
    ).rejects.toThrow(InvalidImageCountError);
    expect(filesRepository.reserveImageUploads).not.toHaveBeenCalled();
  });

  it('rejects duplicate image upload IDs', async () => {
    await expect(
      useCase.execute(
        new ReserveImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId, uploadId],
          reservationId,
        }),
      ),
    ).rejects.toThrow(DuplicateImageUploadIdError);
    expect(filesRepository.reserveImageUploads).not.toHaveBeenCalled();
  });
});
