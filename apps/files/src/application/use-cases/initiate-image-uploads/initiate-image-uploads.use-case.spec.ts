import { ImageContentType, MAX_IMAGE_SIZE_BYTES } from '@app/files-grpc';
import {
  DuplicateClientFileIdError,
  InvalidImageSizeError,
  InvalidImageCountError,
  InvalidUserIdError,
  UnsupportedImageContentTypeError,
} from '../../errors/image-upload.errors.js';
import {
  InitiateImageUploadsCommand,
  InitiateImageUploadsUseCase,
} from './initiate-image-uploads.use-case.js';
import type { FilesRepository } from '../../ports/files.repository.js';
import type { ObjectStorage } from '../../ports/object-storage.js';

describe('InitiateImageUploadsUseCase', () => {
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

  const createUseCase = () => new InitiateImageUploadsUseCase(objectStorage, filesRepository);

  beforeEach(() => {
    filesRepository.createMany.mockReset();
    filesRepository.createMany.mockResolvedValue();
    objectStorage.createPresignedUpload.mockReset();
    objectStorage.createPresignedUpload.mockResolvedValue({
      url: 'https://images-bucket.storage.example.com',
      fields: {
        key: 'object-key',
      },
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    });
  });

  it('initiates one upload for each image', async () => {
    const useCase = createUseCase();

    const result = await useCase.execute(
      new InitiateImageUploadsCommand({
        userId: 42,
        images: [
          {
            clientFileId: '11111111-1111-4111-8111-111111111111',
            originalFilename: 'first.jpg',
            contentType: ImageContentType.JPEG,
            size: 1_024,
          },
          {
            clientFileId: '22222222-2222-4222-8222-222222222222',
            originalFilename: 'second.png',
            contentType: ImageContentType.PNG,
            size: 2_048,
          },
        ],
      }),
    );

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.map(({ id }) => id)).toEqual([
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    ]);
    expect(result.sessions.map(({ clientFileId }) => clientFileId)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(result.sessions.map(({ url }) => url)).toEqual([
      'https://images-bucket.storage.example.com',
      'https://images-bucket.storage.example.com',
    ]);
    expect(result.sessions.map(({ fields }) => fields.key)).toEqual(['object-key', 'object-key']);
    expect(objectStorage.createPresignedUpload).toHaveBeenNthCalledWith(1, {
      objectKey: `users/42/images/${result.sessions[0]?.id}`,
      contentType: ImageContentType.JPEG,
      size: 1_024,
      expiresInSeconds: 300,
    });
    expect(objectStorage.createPresignedUpload).toHaveBeenNthCalledWith(2, {
      objectKey: `users/42/images/${result.sessions[1]?.id}`,
      contentType: ImageContentType.PNG,
      size: 2_048,
      expiresInSeconds: 300,
    });
    expect(filesRepository.createMany).toHaveBeenCalledOnce();
    expect(filesRepository.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        id: result.sessions[0]?.id,
        userId: 42,
        objectKey: `users/42/images/${result.sessions[0]?.id}`,
        originalFilename: 'first.jpg',
        contentType: ImageContentType.JPEG,
        size: 1_024,
        uploadExpiresAt: new Date('2030-01-01T00:00:00Z'),
      }),
      expect.objectContaining({
        id: result.sessions[1]?.id,
        userId: 42,
        objectKey: `users/42/images/${result.sessions[1]?.id}`,
        originalFilename: 'second.png',
        contentType: ImageContentType.PNG,
        size: 2_048,
        uploadExpiresAt: new Date('2030-01-01T00:00:00Z'),
      }),
    ]);
  });

  it.each([
    {
      images: [],
      error: new InvalidImageCountError(),
    },
    {
      images: [
        {
          clientFileId: '11111111-1111-4111-8111-111111111111',
          originalFilename: 'photo.jpg',
          contentType: ImageContentType.JPEG,
          size: MAX_IMAGE_SIZE_BYTES + 1,
        },
      ],
      error: new InvalidImageSizeError(),
    },
    {
      images: [
        {
          clientFileId: '11111111-1111-4111-8111-111111111111',
          originalFilename: 'photo.jpg',
          contentType: ImageContentType.JPEG,
          size: Number.NaN,
        },
      ],
      error: new InvalidImageSizeError(),
    },
    {
      images: [
        {
          clientFileId: '11111111-1111-4111-8111-111111111111',
          originalFilename: 'photo.jpg',
          contentType: ImageContentType.JPEG,
          size: 1.5,
        },
      ],
      error: new InvalidImageSizeError(),
    },
    {
      images: [
        {
          clientFileId: '11111111-1111-4111-8111-111111111111',
          originalFilename: 'photo.gif',
          contentType: 'image/gif',
          size: 1_024,
        },
      ],
      error: new UnsupportedImageContentTypeError('image/gif'),
    },
    {
      images: [
        {
          clientFileId: '11111111-1111-4111-8111-111111111111',
          originalFilename: 'first.jpg',
          contentType: ImageContentType.JPEG,
          size: 1_024,
        },
        {
          clientFileId: '11111111-1111-4111-8111-111111111111',
          originalFilename: 'second.jpg',
          contentType: ImageContentType.JPEG,
          size: 2_048,
        },
      ],
      error: new DuplicateClientFileIdError('11111111-1111-4111-8111-111111111111'),
    },
  ])('rejects invalid image metadata with $error.code', async ({ images, error }) => {
    const useCase = createUseCase();

    await expect(
      useCase.execute(
        new InitiateImageUploadsCommand({
          userId: 42,
          images,
        }),
      ),
    ).rejects.toMatchObject({
      name: error.name,
      code: error.code,
      message: error.message,
    });
    expect(objectStorage.createPresignedUpload).not.toHaveBeenCalled();
    expect(filesRepository.createMany).not.toHaveBeenCalled();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5])(
    'rejects invalid user ID: %s',
    async (userId) => {
      const useCase = createUseCase();

      await expect(
        useCase.execute(
          new InitiateImageUploadsCommand({
            userId,
            images: [
              {
                clientFileId: '11111111-1111-4111-8111-111111111111',
                originalFilename: 'photo.jpg',
                contentType: ImageContentType.JPEG,
                size: 1_024,
              },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(InvalidUserIdError);
      expect(objectStorage.createPresignedUpload).not.toHaveBeenCalled();
      expect(filesRepository.createMany).not.toHaveBeenCalled();
    },
  );
});
