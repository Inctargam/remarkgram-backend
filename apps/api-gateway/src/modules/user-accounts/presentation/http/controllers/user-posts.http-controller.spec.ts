import type { ClientGrpc } from '@nestjs/microservices';
import { POSTS_SERVICE_NAME } from '@app/posts-grpc';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserPostsHttpController } from './user-posts.http-controller.js';

describe('UserPostsHttpController', () => {
  const getAuthPostsPaginated = vi.fn();
  const grpcClient = {
    getService: vi.fn(() => ({ getAuthPostsPaginated })),
  };
  const gatewayConfig = {
    backendApiUrl: 'https://api.remark-gram.com/api/v1/',
  } as ConstructorParameters<typeof UserPostsHttpController>[1];
  const controller = new UserPostsHttpController(grpcClient as unknown as ClientGrpc, gatewayConfig);

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
    expect(grpcClient.getService).toHaveBeenCalledOnce();
    expect(grpcClient.getService).toHaveBeenCalledWith(POSTS_SERVICE_NAME);
  });

  it('forwards the cursor to the posts service', async () => {
    const cursor = Buffer.from(JSON.stringify({ id: 42 })).toString('base64');
    getAuthPostsPaginated.mockReturnValue(of({ items: [], hasMore: true, nextCursor: cursor }));

    await expect(controller.getAuthorPosts({ userId: 7 }, { limit: 20, cursor })).resolves.toEqual({
      items: [],
      hasMore: true,
      nextCursor: cursor,
    });

    expect(getAuthPostsPaginated).toHaveBeenCalledWith({ userId: '7', limit: 20, cursor });
  });

  it('propagates a posts-service failure', async () => {
    const error = new Error('Posts service unavailable');
    getAuthPostsPaginated.mockReturnValue(throwError(() => error));

    await expect(controller.getAuthorPosts({ userId: 42 }, { limit: 8, cursor: undefined })).rejects.toBe(
      error,
    );
  });
});
