import type { ConfigType } from '@nestjs/config';
import { ImageContentType, MAX_AVATAR_SIZE_BYTES } from '@app/files-grpc';
import type { filesConfig } from '../../../config/files.config.js';
import { FileUploadStatus } from '../../../domain/enums/file-upload-status.enum.js';
import {
  ImageUploadMetadataMismatchError,
  InvalidImageSizeError,
  InvalidUserIdError,
  UnsupportedImageContentTypeError,
} from '../../errors/image-upload.errors.js';
import type { FilesRepository } from '../../ports/files.repository.js';
import type { ObjectStorage } from '../../ports/object-storage.js';
import { ImageUploadSessionsService } from '../../services/image-upload-sessions.service.js';
import {
  CompleteImageUploadsCommand,
  CompleteImageUploadsUseCase,
} from '../complete-image-uploads/complete-image-uploads.use-case.js';
import {
  InitiateAvatarUploadCommand,
  InitiateAvatarUploadUseCase,
} from './initiate-avatar-upload.use-case.js';

describe('InitiateAvatarUploadUseCase', () => {
  const filesRepository = {
    createMany: vi.fn<FilesRepository['createMany']>(),
    findImageUploads: vi.fn<FilesRepository['findImageUploads']>(),
    updateImageUploadsStatusIfAllPending: vi.fn<FilesRepository['updateImageUploadsStatusIfAllPending']>(),
    deleteRejectedImageUploads: vi.fn<FilesRepository['deleteRejectedImageUploads']>(),
  };
  const objectStorage = {
    createPresignedUpload: vi.fn<ObjectStorage['createPresignedUpload']>(),
    getObjectMetadata: vi.fn<ObjectStorage['getObjectMetadata']>(),
    deleteObject: vi.fn<ObjectStorage['deleteObject']>(),
    createPresignedDownloadUrl: vi.fn<ObjectStorage['createPresignedDownloadUrl']>(),
  };
  const repository = filesRepository as unknown as FilesRepository;
  const config = { s3: { uploadUrlExpiresInSeconds: 600 } } as ConfigType<typeof filesConfig>;
  const useCase = new InitiateAvatarUploadUseCase(
    new ImageUploadSessionsService(objectStorage, repository, config),
  );
  const input = {
    userId: 42,
    clientFileId: '11111111-1111-4111-8111-111111111111',
    originalFilename: 'avatar.jpg',
    contentType: ImageContentType.JPEG,
    size: 1_024,
  };
  const expiresAt = new Date('2030-01-01T00:00:00Z');

  beforeEach(() => {
    vi.resetAllMocks();
    filesRepository.createMany.mockResolvedValue();
    filesRepository.updateImageUploadsStatusIfAllPending.mockResolvedValue();
    filesRepository.deleteRejectedImageUploads.mockResolvedValue();
    objectStorage.deleteObject.mockResolvedValue();
    objectStorage.createPresignedUpload.mockResolvedValue({
      url: 'https://storage.example.com',
      fields: { key: 'object-key' },
      expiresAt,
    });
  });

  it.each([
    { contentType: ImageContentType.JPEG, size: 1 },
    { contentType: ImageContentType.PNG, size: MAX_AVATAR_SIZE_BYTES },
  ])('creates one pending upload for $contentType at $size bytes', async (metadata) => {
    const result = await useCase.execute(new InitiateAvatarUploadCommand({ ...input, ...metadata }));
    expect(result).toEqual({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ) as unknown,
      clientFileId: input.clientFileId,
      url: 'https://storage.example.com',
      fields: { key: 'object-key' },
    });
    expect(objectStorage.createPresignedUpload).toHaveBeenCalledExactlyOnceWith({
      objectKey: `users/42/images/${result.id}`,
      ...metadata,
      expiresInSeconds: 600,
    });
    expect(filesRepository.createMany).toHaveBeenCalledExactlyOnceWith([
      {
        id: result.id,
        userId: 42,
        objectKey: `users/42/images/${result.id}`,
        originalFilename: input.originalFilename,
        ...metadata,
        uploadStatus: FileUploadStatus.PENDING,
        uploadExpiresAt: expiresAt,
      },
    ]);
  });

  it.each([0, -1, MAX_AVATAR_SIZE_BYTES + 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid size before creating a session: %s',
    async (size) => {
      await expect(
        useCase.execute(new InitiateAvatarUploadCommand({ ...input, size })),
      ).rejects.toMatchObject({
        code: new InvalidImageSizeError(MAX_AVATAR_SIZE_BYTES).code,
        message: 'Image size must be between 1 and 10485760 bytes',
      });
      expect(objectStorage.createPresignedUpload).not.toHaveBeenCalled();
      expect(filesRepository.createMany).not.toHaveBeenCalled();
    },
  );

  it.each(['image/gif', 'image/webp', ''])('rejects unsupported MIME type: %s', async (contentType) => {
    await expect(
      useCase.execute(new InitiateAvatarUploadCommand({ ...input, contentType })),
    ).rejects.toBeInstanceOf(UnsupportedImageContentTypeError);
    expect(objectStorage.createPresignedUpload).not.toHaveBeenCalled();
    expect(filesRepository.createMany).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid user ID: %s',
    async (userId) => {
      await expect(
        useCase.execute(new InitiateAvatarUploadCommand({ ...input, userId })),
      ).rejects.toBeInstanceOf(InvalidUserIdError);
      expect(objectStorage.createPresignedUpload).not.toHaveBeenCalled();
      expect(filesRepository.createMany).not.toHaveBeenCalled();
    },
  );

  it('propagates signing failure without saving a file', async () => {
    const error = new Error('Signing failed');
    objectStorage.createPresignedUpload.mockRejectedValueOnce(error);
    await expect(useCase.execute(new InitiateAvatarUploadCommand(input))).rejects.toBe(error);
    expect(filesRepository.createMany).not.toHaveBeenCalled();
  });

  it('does not return a session if saving the file fails', async () => {
    const error = new Error('Database unavailable');
    filesRepository.createMany.mockRejectedValueOnce(error);
    await expect(useCase.execute(new InitiateAvatarUploadCommand(input))).rejects.toBe(error);
  });

  it.each([
    { size: input.size, contentType: input.contentType, expectedStatus: FileUploadStatus.COMPLETED },
    { size: input.size + 1, contentType: input.contentType, expectedStatus: FileUploadStatus.REJECTED },
    { size: input.size, contentType: ImageContentType.PNG, expectedStatus: FileUploadStatus.REJECTED },
  ])('uses the existing confirmation flow: $expectedStatus ($size, $contentType)', async (scenario) => {
    const session = await useCase.execute(new InitiateAvatarUploadCommand(input));
    const [records] = filesRepository.createMany.mock.calls[0];
    filesRepository.findImageUploads.mockResolvedValue([...records]);
    objectStorage.getObjectMetadata.mockResolvedValue({
      size: scenario.size,
      contentType: scenario.contentType,
    });
    const complete = new CompleteImageUploadsUseCase(repository, objectStorage);
    const result = complete.execute(new CompleteImageUploadsCommand({ userId: 42, uploadIds: [session.id] }));
    if (scenario.expectedStatus === FileUploadStatus.COMPLETED) {
      await expect(result).resolves.toBeUndefined();
    } else {
      await expect(result).rejects.toBeInstanceOf(ImageUploadMetadataMismatchError);
    }
    expect(filesRepository.findImageUploads).toHaveBeenCalledWith({ userId: 42, uploadIds: [session.id] });
    expect(objectStorage.getObjectMetadata).toHaveBeenCalledWith(records[0].objectKey);
    expect(filesRepository.updateImageUploadsStatusIfAllPending).toHaveBeenCalledWith({
      userId: 42,
      uploadIds: [session.id],
      uploadStatus: scenario.expectedStatus,
      uploadedAt:
        scenario.expectedStatus === FileUploadStatus.COMPLETED ? (expect.any(Date) as unknown) : null,
    });
  });
});
