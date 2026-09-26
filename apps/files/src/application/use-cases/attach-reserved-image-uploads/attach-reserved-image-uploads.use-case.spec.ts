import { InvalidUserIdError } from '../../errors/image-upload.errors.js';
import type { FilesRepository } from '../../ports/files.repository.js';
import {
  AttachReservedImageUploadsCommand,
  AttachReservedImageUploadsUseCase,
} from './attach-reserved-image-uploads.use-case.js';

describe('AttachReservedImageUploadsUseCase', () => {
  const filesRepository = {
    attachReservedImageUploads: vi.fn<FilesRepository['attachReservedImageUploads']>(),
  };
  const useCase = new AttachReservedImageUploadsUseCase(filesRepository as unknown as FilesRepository);
  const reservationId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    filesRepository.attachReservedImageUploads.mockReset();
    filesRepository.attachReservedImageUploads.mockResolvedValue();
  });

  it('attaches image uploads reserved by the operation', async () => {
    await expect(
      useCase.execute(new AttachReservedImageUploadsCommand({ userId: 42, reservationId })),
    ).resolves.toBeUndefined();

    expect(filesRepository.attachReservedImageUploads).toHaveBeenCalledWith({
      userId: 42,
      reservationId,
    });
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects an invalid user ID: %s', async (userId) => {
    await expect(
      useCase.execute(new AttachReservedImageUploadsCommand({ userId, reservationId })),
    ).rejects.toThrow(InvalidUserIdError);

    expect(filesRepository.attachReservedImageUploads).not.toHaveBeenCalled();
  });
});
