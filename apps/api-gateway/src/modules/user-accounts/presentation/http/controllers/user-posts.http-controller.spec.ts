import type { ClientGrpc } from '@nestjs/microservices';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserPostsHttpController } from './user-posts.http-controller.js';

describe('UserPostsHttpController', () => {
  const getAuthPostsPaginated = vi.fn();
  const grpcClient = {
    getService: vi.fn(() => ({ getAuthPostsPaginated })),
  };
  const controller = new UserPostsHttpController(grpcClient as unknown as ClientGrpc);

  beforeEach(() => {
    getAuthPostsPaginated.mockReset();
    controller.onModuleInit();
  });

  it('returns the mapped author posts page', async () => {
    getAuthPostsPaginated.mockReturnValue(
      of({
        items: [],
        hasMore: false,
        nextCursor: undefined,
      }),
    );

    await expect(
      controller.getAuthorPosts(
        { userId: 42 },
        {
          limit: 8,
          cursor: undefined,
        },
      ),
    ).resolves.toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });

    expect(getAuthPostsPaginated).toHaveBeenCalledWith({
      userId: '42',
      limit: 8,
      cursor: undefined,
    });
  });
});
