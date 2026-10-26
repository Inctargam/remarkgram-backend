import {
  AttachPostImagesCommand,
  AttachPostImagesUseCase,
} from '../use-cases/attach-post-images/attach-post-images.use-case.js';
import {
  CancelPostImageAttachmentCommand,
  CancelPostImageAttachmentUseCase,
} from '../use-cases/cancel-post-image-attachment/cancel-post-image-attachment.use-case.js';
import type { FilesRepository } from '../ports/files.repository.js';
import { MAX_IMAGES_PER_UPLOAD_REQUEST } from '@app/files-grpc';
import {
  DuplicateImageUploadIdError,
  InvalidImageCountError,
  InvalidUserIdError,
} from '../errors/image-upload.errors.js';

describe.each([
  [AttachPostImagesUseCase, AttachPostImagesCommand, 'attachPostImages'],
  [CancelPostImageAttachmentUseCase, CancelPostImageAttachmentCommand, 'cancelPostImageAttachment'],
] as const)('%s', (UseCase, Command, method) => {
  const repository = { attachPostImages: vi.fn(), cancelPostImageAttachment: vi.fn() };
  const useCase = new UseCase(repository as unknown as FilesRepository);
  const params = {
    userId: 42,
    fileIds: ['11111111-1111-4111-8111-111111111111'],
    operationId: '22222222-2222-4222-8222-222222222222',
  };
  beforeEach(() => vi.resetAllMocks());
  it('forwards validated input', async () => {
    await useCase.execute(new Command(params));
    expect(repository[method]).toHaveBeenCalledExactlyOnceWith(params);
  });
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects user ID %s', async (userId) => {
    await expect(useCase.execute(new Command({ ...params, userId }))).rejects.toThrow(InvalidUserIdError);
    expect(repository[method]).not.toHaveBeenCalled();
  });
  it.each([
    { fileIds: [] },
    { fileIds: Array.from({ length: MAX_IMAGES_PER_UPLOAD_REQUEST + 1 }, (_, i) => String(i)) },
  ])('rejects invalid count', async ({ fileIds }) => {
    await expect(useCase.execute(new Command({ ...params, fileIds }))).rejects.toThrow(
      InvalidImageCountError,
    );
    expect(repository[method]).not.toHaveBeenCalled();
  });
  it('rejects duplicates', async () => {
    await expect(
      useCase.execute(new Command({ ...params, fileIds: [...params.fileIds, ...params.fileIds] })),
    ).rejects.toThrow(DuplicateImageUploadIdError);
    expect(repository[method]).not.toHaveBeenCalled();
  });
});
