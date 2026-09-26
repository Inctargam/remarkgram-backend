import { InvalidUserIdError } from '../../errors/image-upload.errors.js';
import type { FilesRepository } from '../../ports/files.repository.js';
import {
  ReleaseReservedImageUploadsCommand,
  ReleaseReservedImageUploadsUseCase,
} from './release-reserved-image-uploads.use-case.js';

describe('ReleaseReservedImageUploadsUseCase', () => {
  const filesRepository = {
    releaseReservedImageUploads: vi.fn<FilesRepository['releaseReservedImageUploads']>(),
  };
  const useCase = new ReleaseReservedImageUploadsUseCase(filesRepository as unknown as FilesRepository);
  const reservationId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    filesRepository.releaseReservedImageUploads.mockReset();
    filesRepository.releaseReservedImageUploads.mockResolvedValue();
  });

  it('releases image uploads reserved by the operation', async () => {
    await expect(
      useCase.execute(new ReleaseReservedImageUploadsCommand({ userId: 42, reservationId })),
    ).resolves.toBeUndefined();

    expect(filesRepository.releaseReservedImageUploads).toHaveBeenCalledWith({
      userId: 42,
      reservationId,
    });
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects an invalid user ID: %s', async (userId) => {
    await expect(
      useCase.execute(new ReleaseReservedImageUploadsCommand({ userId, reservationId })),
    ).rejects.toThrow(InvalidUserIdError);

    expect(filesRepository.releaseReservedImageUploads).not.toHaveBeenCalled();
  });
});
