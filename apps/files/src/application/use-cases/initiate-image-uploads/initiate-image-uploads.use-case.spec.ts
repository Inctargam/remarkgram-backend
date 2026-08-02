import { ImageContentType, MAX_IMAGE_SIZE_BYTES } from '@app/files-grpc';
import {
  InvalidImageSizeError,
  InvalidImageCountError,
  UnsupportedImageContentTypeError,
} from '../../errors/image-upload.errors.js';
import {
  InitiateImageUploadsCommand,
  InitiateImageUploadsUseCase,
} from './initiate-image-uploads.use-case.js';

describe('InitiateImageUploadsUseCase', () => {
  it('initiates one upload for each image', async () => {
    const useCase = new InitiateImageUploadsUseCase();

    const result = await useCase.execute(
      new InitiateImageUploadsCommand({
        userId: 'user-id',
        images: [
          { originalFilename: 'first.jpg', contentType: ImageContentType.JPEG, size: 1_024 },
          { originalFilename: 'second.png', contentType: ImageContentType.PNG, size: 2_048 },
        ],
      }),
    );

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.map(({ id }) => id)).toEqual([
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    ]);
  });

  it.each([
    {
      images: [],
      error: new InvalidImageCountError(),
    },
    {
      images: [
        { originalFilename: 'photo.jpg', contentType: ImageContentType.JPEG, size: MAX_IMAGE_SIZE_BYTES + 1 },
      ],
      error: new InvalidImageSizeError(),
    },
    {
      images: [{ originalFilename: 'photo.gif', contentType: 'image/gif', size: 1_024 }],
      error: new UnsupportedImageContentTypeError('image/gif'),
    },
  ])('rejects invalid image metadata with $error.code', ({ images, error }) => {
    const useCase = new InitiateImageUploadsUseCase();
    let thrownError: unknown;

    try {
      void useCase.execute(
        new InitiateImageUploadsCommand({
          userId: 'user-id',
          images,
        }),
      );
    } catch (caught) {
      thrownError = caught;
    }

    expect(thrownError).toMatchObject({
      name: error.name,
      code: error.code,
      message: error.message,
    });
  });
});
