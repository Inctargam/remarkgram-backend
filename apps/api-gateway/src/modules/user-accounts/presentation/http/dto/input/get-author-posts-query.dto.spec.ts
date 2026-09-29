import { DEFAULT_POSTS_PAGE_SIZE, MAX_POSTS_PAGE_SIZE, MIN_POSTS_PAGE_SIZE } from '@app/posts-grpc';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetAuthorPostsQueryDto } from './get-author-posts-query.dto.js';

describe('GetAuthorPostsQueryDto', () => {
  it('uses the default page size when query parameters are omitted', async () => {
    const dto = plainToInstance(GetAuthorPostsQueryDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.limit).toBe(DEFAULT_POSTS_PAGE_SIZE);
    expect(dto.cursor).toBeUndefined();
  });

  it.each([MIN_POSTS_PAGE_SIZE, MAX_POSTS_PAGE_SIZE])(
    'accepts inclusive page-size boundary %s',
    async (limit) => {
      const dto = plainToInstance(GetAuthorPostsQueryDto, {
        limit: String(limit),
        cursor: Buffer.from(JSON.stringify({ id: 42 })).toString('base64'),
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
      expect(dto.limit).toBe(limit);
    },
  );

  it.each([MIN_POSTS_PAGE_SIZE - 1, MAX_POSTS_PAGE_SIZE + 1, 1.5, 'invalid'])(
    'rejects an invalid page size: %s',
    async (limit) => {
      const dto = plainToInstance(GetAuthorPostsQueryDto, { limit });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it.each(['', 'not base64!', 42])('rejects an invalid cursor: %s', async (cursor) => {
    const dto = plainToInstance(GetAuthorPostsQueryDto, { cursor });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
