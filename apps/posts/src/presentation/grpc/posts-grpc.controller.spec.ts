import type { CommandBus } from '@nestjs/cqrs';
import { CreatePostCommand } from '../../application/use-cases/create-post/create-post.use-case.js';
import { PostsGrpcController } from './posts-grpc.controller.js';
import { expect } from 'vitest';
import { UpdatePostCommand } from '../../application/use-cases/update-post/update-post.use-case.js';

describe('PostsGrpcController', () => {
  const commandBus = { execute: vi.fn() };
  const controller = new PostsGrpcController(commandBus as unknown as CommandBus);

  beforeEach(() => {
    commandBus.execute.mockReset();
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
});
