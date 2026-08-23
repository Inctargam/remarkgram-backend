import { MAX_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import {
  DuplicateImageUploadIdError,
  ImageUploadNotFoundError,
  ImageUploadsNotAvailableError,
  InvalidImageCountError,
  InvalidImageUploadIdError,
  InvalidImageUploadOperationIdError,
  InvalidImageUploadReservationIdError,
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
  const operationId = '33333333-3333-4333-8333-333333333333';
  const now = new Date('2030-01-01T00:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    filesRepository.reserveImageUploads.mockReset();
    filesRepository.reserveImageUploads.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reserves image uploads through the repository', async () => {
    await expect(
      useCase.execute(
        new ReserveImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
          reservationId,
          operationId,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(filesRepository.reserveImageUploads).toHaveBeenCalledWith({
      userId: 42,
      uploadIds: [uploadId],
      reservationId,
      operationId,
      reservationExpiresAt: new Date('2030-01-01T00:05:00Z'),
    });
  });

  it('reports missing image uploads', async () => {
    filesRepository.reserveImageUploads.mockRejectedValue(new ImageUploadNotFoundError());

    await expect(
      useCase.execute(
        new ReserveImageUploadsCommand({ userId: 42, uploadIds: [uploadId], reservationId, operationId }),
      ),
    ).rejects.toThrow(ImageUploadNotFoundError);
  });

  it('reports image uploads unavailable for reservation', async () => {
    filesRepository.reserveImageUploads.mockRejectedValue(new ImageUploadsNotAvailableError());

    await expect(
      useCase.execute(
        new ReserveImageUploadsCommand({ userId: 42, uploadIds: [uploadId], reservationId, operationId }),
      ),
    ).rejects.toThrow(ImageUploadsNotAvailableError);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects an invalid user ID: %s', async (userId) => {
    await expect(
      useCase.execute(
        new ReserveImageUploadsCommand({ userId, uploadIds: [uploadId], reservationId, operationId }),
      ),
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
      useCase.execute(new ReserveImageUploadsCommand({ userId: 42, uploadIds, reservationId, operationId })),
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
          operationId,
        }),
      ),
    ).rejects.toThrow(DuplicateImageUploadIdError);
    expect(filesRepository.reserveImageUploads).not.toHaveBeenCalled();
  });

  it('rejects a malformed image upload ID', async () => {
    await expect(
      useCase.execute(
        new ReserveImageUploadsCommand({
          userId: 42,
          uploadIds: ['not-a-uuid'],
          reservationId,
          operationId,
        }),
      ),
    ).rejects.toThrow(InvalidImageUploadIdError);

    expect(filesRepository.reserveImageUploads).not.toHaveBeenCalled();
  });

  it('rejects a malformed operation ID', async () => {
    await expect(
      useCase.execute(
        new ReserveImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
          reservationId,
          operationId: 'not-a-uuid',
        }),
      ),
    ).rejects.toThrow(InvalidImageUploadOperationIdError);

    expect(filesRepository.reserveImageUploads).not.toHaveBeenCalled();
  });

  it('rejects a malformed reservation ID', async () => {
    await expect(
      useCase.execute(
        new ReserveImageUploadsCommand({
          userId: 42,
          uploadIds: [uploadId],
          reservationId: 'not-a-uuid',
          operationId,
        }),
      ),
    ).rejects.toThrow(InvalidImageUploadReservationIdError);

    expect(filesRepository.reserveImageUploads).not.toHaveBeenCalled();
  });
});
