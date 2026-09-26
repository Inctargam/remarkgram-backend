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
import { AttachAvatarUploadCommand, AttachAvatarUploadUseCase } from './attach-avatar-upload.use-case.js';

describe('AttachAvatarUploadUseCase', () => {
  const repository = { attachImageUpload: vi.fn() };
  const ctx = {};
  const unitOfWork = { run: vi.fn((callback: (ctx: unknown) => Promise<void>) => callback(ctx)) };
  const useCase = new AttachAvatarUploadUseCase(
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
    repository.attachImageUpload.mockResolvedValue(file);
  });

  it.each(['image/jpeg', 'image/png'])(
    'accepts %s at both boundaries within a transaction',
    async (contentType) => {
      for (const size of [1, MAX_AVATAR_SIZE_BYTES]) {
        repository.attachImageUpload.mockResolvedValue({ size, contentType });
        await useCase.execute(new AttachAvatarUploadCommand(params));
      }
      expect(repository.attachImageUpload).toHaveBeenCalledTimes(2);
      expect(repository.attachImageUpload).toHaveBeenCalledWith(params, ctx);
      expect(unitOfWork.run).toHaveBeenCalledTimes(2);
    },
  );

  it.each([0, -1, 1.5, MAX_AVATAR_SIZE_BYTES + 1, 20 * 1024 * 1024])(
    'rejects size %s inside the transaction so attachment rolls back',
    async (size) => {
      repository.attachImageUpload.mockResolvedValue({ ...file, size });
      await expect(useCase.execute(new AttachAvatarUploadCommand(params))).rejects.toBeInstanceOf(
        InvalidImageSizeError,
      );
    },
  );

  it('rejects unsupported content type inside the transaction', async () => {
    repository.attachImageUpload.mockResolvedValue({ ...file, contentType: 'image/gif' });
    await expect(useCase.execute(new AttachAvatarUploadCommand(params))).rejects.toBeInstanceOf(
      UnsupportedImageContentTypeError,
    );
  });

  it('accepts an already validated exact replay', async () => {
    repository.attachImageUpload.mockResolvedValue(null);
    await expect(useCase.execute(new AttachAvatarUploadCommand(params))).resolves.toBeUndefined();
  });

  it.each([0, -1, 1.5, NaN])('rejects invalid user %s before opening a transaction', async (userId) => {
    await expect(
      useCase.execute(new AttachAvatarUploadCommand({ ...params, userId })),
    ).rejects.toBeInstanceOf(InvalidUserIdError);
    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(repository.attachImageUpload).not.toHaveBeenCalled();
  });

  it.each([new ImageUploadNotFoundError(), new ImageUploadStateConflictError()])(
    'propagates atomic attachment failure %s',
    async (error) => {
      repository.attachImageUpload.mockRejectedValue(error);
      await expect(useCase.execute(new AttachAvatarUploadCommand(params))).rejects.toBe(error);
    },
  );
});
