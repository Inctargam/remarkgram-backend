import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_IMAGE_SIZE_BYTES } from '@app/files-grpc';
import { InitiateImageUploadsDto } from './initiate-image-uploads.dto.js';

const validImage = {
  clientFileId: '11111111-1111-4111-8111-111111111111',
  originalFilename: 'photo.jpg',
  contentType: 'image/jpeg',
  size: 1_024,
};

const createDto = (images: unknown) =>
  plainToInstance(InitiateImageUploadsDto, {
    images,
  });

describe('InitiateImageUploadsDto', () => {
  it('validates the request structure', async () => {
    expect(await validate(createDto([validImage]))).toHaveLength(0);
  });

  it('leaves image count and supported content type validation to the use case', async () => {
    expect(await validate(createDto([]))).toHaveLength(0);
    expect(
      await validate(
        createDto([
          {
            ...validImage,
            contentType: 'image/gif',
          },
        ]),
      ),
    ).toHaveLength(0);
  });

  it.each([0, MAX_IMAGE_SIZE_BYTES + 1])(
    'leaves the business image size validation to the use case: %s',
    async (size) => {
      expect(
        await validate(
          createDto([
            {
              ...validImage,
              size,
            },
          ]),
        ),
      ).toHaveLength(0);
    },
  );

  it.each(['1024', 1.5, 4_294_967_297])('rejects a size unsafe for the int32 contract: %s', async (size) => {
    const errors = await validate(
      createDto([
        {
          ...validImage,
          size,
        },
      ]),
    );

    expect(errors).not.toHaveLength(0);
  });
});
