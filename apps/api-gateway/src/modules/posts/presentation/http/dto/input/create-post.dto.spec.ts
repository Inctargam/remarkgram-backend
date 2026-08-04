import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePostDto } from './create-post.dto.js';

describe('CreatePostDto', () => {
  const imageId = '11111111-1111-4111-8111-111111111111';

  it('accepts an optional string description and UUID image IDs', async () => {
    const dto = plainToInstance(CreatePostDto, {
      description: 'A new post',
      imageIds: [imageId],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts an omitted description', async () => {
    const dto = plainToInstance(CreatePostDto, { imageIds: [imageId] });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    { imageIds: 'not-an-array' },
    { imageIds: ['not-a-uuid'] },
    { description: 42, imageIds: [imageId] },
    { description: null, imageIds: [imageId] },
  ])('rejects malformed HTTP input', async (input) => {
    const dto = plainToInstance(CreatePostDto, input);

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
