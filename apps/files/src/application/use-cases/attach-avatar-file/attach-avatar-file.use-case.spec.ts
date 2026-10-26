import { MAX_AVATAR_SIZE_BYTES } from '@app/files-grpc';
import type { FilesRepository } from '../../ports/files.repository.js';
import type { UnitOfWork } from '../../ports/unit-of-work.js';
import {
  ImageUploadNotFoundError,
  InvalidImageSizeError,
  InvalidUserIdError,
  UnsupportedImageContentTypeError,
  ImageUploadStateConflictError,
} from '../../errors/image-upload.errors.js';
import { AttachAvatarFileCommand, AttachAvatarFileUseCase } from './attach-avatar-file.use-case.js';

describe('AttachAvatarFileUseCase', () => {
  const repository = { attachAvatarFile: vi.fn() };
  const ctx = {};
  const unitOfWork = { run: vi.fn((callback: (ctx: unknown) => Promise<void>) => callback(ctx)) };
  const useCase = new AttachAvatarFileUseCase(
    repository as unknown as FilesRepository,
    unitOfWork as unknown as UnitOfWork,
  );
  const params = {
    userId: 42,
    fileId: '11111111-1111-4111-8111-111111111111',
    operationId: '22222222-2222-4222-8222-222222222222',
  };
  const file = { size: 1024, contentType: 'image/jpeg' };
  beforeEach(() => {
    vi.clearAllMocks();
    repository.attachAvatarFile.mockResolvedValue(file);
  });

  it.each(['image/jpeg', 'image/png'])(
    'accepts %s at both boundaries within a transaction',
    async (contentType) => {
      for (const size of [1, MAX_AVATAR_SIZE_BYTES]) {
        repository.attachAvatarFile.mockResolvedValue({ size, contentType });
        await useCase.execute(new AttachAvatarFileCommand(params));
      }
      expect(repository.attachAvatarFile).toHaveBeenCalledTimes(2);
      expect(repository.attachAvatarFile).toHaveBeenCalledWith(params, ctx);
      expect(unitOfWork.run).toHaveBeenCalledTimes(2);
    },
  );

  it.each([0, -1, 1.5, MAX_AVATAR_SIZE_BYTES + 1, 20 * 1024 * 1024])(
    'rejects size %s inside the transaction so attachment rolls back',
    async (size) => {
      repository.attachAvatarFile.mockResolvedValue({ ...file, size });
      await expect(useCase.execute(new AttachAvatarFileCommand(params))).rejects.toBeInstanceOf(
        InvalidImageSizeError,
      );
    },
  );

  it('rejects unsupported content type inside the transaction', async () => {
    repository.attachAvatarFile.mockResolvedValue({ ...file, contentType: 'image/gif' });
    await expect(useCase.execute(new AttachAvatarFileCommand(params))).rejects.toBeInstanceOf(
      UnsupportedImageContentTypeError,
    );
  });

  it('accepts an already validated exact replay', async () => {
    repository.attachAvatarFile.mockResolvedValue(null);
    await expect(useCase.execute(new AttachAvatarFileCommand(params))).resolves.toBeUndefined();
  });

  it.each([0, -1, 1.5, NaN])('rejects invalid user %s before opening a transaction', async (userId) => {
    await expect(useCase.execute(new AttachAvatarFileCommand({ ...params, userId }))).rejects.toBeInstanceOf(
      InvalidUserIdError,
    );
    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(repository.attachAvatarFile).not.toHaveBeenCalled();
  });

  it.each([new ImageUploadNotFoundError(), new ImageUploadStateConflictError()])(
    'propagates atomic attachment failure %s',
    async (error) => {
      repository.attachAvatarFile.mockRejectedValue(error);
      await expect(useCase.execute(new AttachAvatarFileCommand(params))).rejects.toBe(error);
    },
  );
});
