import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetAuthorPostsParamsDto } from './get-author-posts-params.dto.js';

describe('GetAuthorPostsParamsDto', () => {
  it('transforms a positive integer route parameter to a number', async () => {
    const dto = plainToInstance(GetAuthorPostsParamsDto, { userId: '42' });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.userId).toBe(42);
  });

  it.each(['invalid', '1.5', '0', '-1'])('rejects an invalid author ID: %s', async (userId) => {
    const dto = plainToInstance(GetAuthorPostsParamsDto, { userId });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
