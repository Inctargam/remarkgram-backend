import { describe, expect } from 'vitest';
import { GetAuthorPostsQuery, GetAuthorPostsQueryHandler } from './get-author-posts.query-handler.js';
import type { PostsQueryRepository } from '../../ports/posts-query.repository.js';
import { InvalidPostsCursorError, InvalidPostsPageLimitError } from '../../errors/post-pagination.errors.js';
import { InvalidUserIdError } from '../../errors/create-post.errors.js';
import { PostViewMapper } from '../../../infrastructure/prisma/mappers/post-view.mapper.js';

describe('GetAuthorPostsQueryHandler', () => {
  const repository = {
    findAuthorPostsPage: vi.fn<PostsQueryRepository['findAuthorPostsPage']>(),
  } satisfies PostsQueryRepository;
  const queryHandler = new GetAuthorPostsQueryHandler(repository);

  it('throws InvalidUserIdError when author ID is not a number', async () => {
    await expect(
      queryHandler.execute(
        new GetAuthorPostsQuery({
          authorId: 'not-a-number' as unknown as number,
          limit: 10,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidUserIdError);
  });
  it('throws InvalidPostsPageLimitError when limit less than 1 or not Integer type', async () => {
    await expect(
      queryHandler.execute(
        new GetAuthorPostsQuery({
          authorId: 1,
          limit: 0,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPostsPageLimitError);

    await expect(
      queryHandler.execute(
        new GetAuthorPostsQuery({
          authorId: 1,
          limit: 2.4,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPostsPageLimitError);

    await expect(
      queryHandler.execute(
        new GetAuthorPostsQuery({
          authorId: 1,
          limit: '1.5' as unknown as number,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPostsPageLimitError);
  });

  it('throws InvalidPostsCursorError when cursor is not a string', async () => {
    await expect(
      queryHandler.execute(
        new GetAuthorPostsQuery({
          authorId: 1,
          limit: 1,
          cursor: 123 as unknown as string,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPostsCursorError);
  });

  it('expect findAuthorPostsPage called valid arguments', async () => {
    const posts = [
      {
        id: 1,
        authorId: 1,
        description: 'First post',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        publishedAt: new Date('2023-01-01T00:00:00.000Z'),
        images: [],
        version: 0,
        deletedAt: null,
      },
    ];
    const items = posts.map((p) => PostViewMapper.toView(p));
    repository.findAuthorPostsPage.mockResolvedValue({
      items: items,
      hasMore: false,
      nextCursor: null,
    });

    await expect(
      queryHandler.execute(
        new GetAuthorPostsQuery({
          authorId: 1,
          limit: 8,
        }),
      ),
    ).resolves.toEqual({
      items: items,
      hasMore: false,
      nextCursor: undefined,
    });

    expect(repository.findAuthorPostsPage).toHaveBeenCalledWith({
      authorId: 1,
      limit: 8,
      cursor: null,
    });
  });
});
