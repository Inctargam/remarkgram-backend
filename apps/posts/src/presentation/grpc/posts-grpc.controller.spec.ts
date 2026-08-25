import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreatePostCommand } from '../../application/use-cases/create-post/create-post.use-case.js';
import { PostsGrpcController } from './posts-grpc.controller.js';
import { expect } from 'vitest';
import { UpdatePostCommand } from '../../application/use-cases/update-post/update-post.use-case.js';
import { GetAuthorPostsQuery } from '../../application/use-cases/get-author-posts/get-author-posts.query-handler.js';
import { SoftDeletePostCommand } from '../../application/use-cases/soft-delete-post/soft-delete-post.use-case.js';

describe('PostsGrpcController', () => {
  const commandBus = { execute: vi.fn() };
  const queryBus = { execute: vi.fn() };
  const controller = new PostsGrpcController(
    commandBus as unknown as CommandBus,
    queryBus as unknown as QueryBus,
  );

  beforeEach(() => {
    commandBus.execute.mockReset();
    queryBus.execute.mockReset();
  });

  it('delegates post creation to the use case', async () => {
    const request = {
      userId: '42',
      description: 'A new post',
      imageIds: ['11111111-1111-4111-8111-111111111111'],
    };
    commandBus.execute.mockResolvedValue({ id: 10 });

    await expect(controller.createPost(request)).resolves.toEqual({ id: 10 });

    expect(commandBus.execute).toHaveBeenCalledWith(
      new CreatePostCommand({
        userId: 42,
        description: 'A new post',
        imageIds: request.imageIds,
      }),
    );
  });

  it('delegates update post to the use case', async () => {
    const request = {
      userId: '1',
      postId: '1',
      description: 'Update post',
    };
    commandBus.execute.mockResolvedValue(undefined);

    await expect(controller.updatePost(request)).resolves.toEqual({});
    expect(commandBus.execute).toHaveBeenCalledWith(
      new UpdatePostCommand({
        authorId: 1,
        postId: 1,
        description: 'Update post',
      }),
    );
  });

  it('delegates get auth posts paginated to the query handler', async () => {
    const request = {
      userId: '1',
      limit: 10,
      cursor: undefined,
    };
    queryBus.execute.mockResolvedValue({ items: [], nextCursor: undefined, hasMore: false });

    const response = await controller.getAuthPostsPaginated(request);

    expect(response).toEqual({ items: [], nextCursor: undefined, hasMore: false });
    expect(queryBus.execute).toHaveBeenCalledWith(
      new GetAuthorPostsQuery({
        authorId: +request.userId,
        limit: 10,
        cursor: undefined,
      }),
    );
  });

  it('delegates post deletion to the soft-delete use case', async () => {
    commandBus.execute.mockResolvedValue(undefined);

    await expect(controller.deletePost({ userId: '42', postId: '10' })).resolves.toEqual({});

    expect(commandBus.execute).toHaveBeenCalledOnce();
    expect(commandBus.execute).toHaveBeenCalledWith(new SoftDeletePostCommand({ authorId: 42, postId: 10 }));
  });

  it('propagates a post deletion failure to the RPC exception filter', async () => {
    const error = new Error('Delete failed');
    commandBus.execute.mockRejectedValue(error);

    await expect(controller.deletePost({ userId: '42', postId: '10' })).rejects.toBe(error);
  });
});
