import type { ClientGrpc } from '@nestjs/microservices';
import type { Request } from 'express';
import { firstValueFrom, of } from 'rxjs';
import { PostsHttpController } from './posts-http.controller.js';
import { expect } from 'vitest';

describe('PostsHttpController', () => {
  const createPost = vi.fn();
  const updatePost = vi.fn();
  const deletePost = vi.fn();
  const grpcClient = {
    getService: vi.fn(() => ({ createPost, updatePost, deletePost })),
  };
  const controller = new PostsHttpController(grpcClient as unknown as ClientGrpc);

  beforeEach(() => {
    createPost.mockReset();
    grpcClient.getService.mockClear();
    controller.onModuleInit();
    updatePost.mockReset();
  });

  it('forwards post creation with the authenticated user ID', async () => {
    createPost.mockReturnValue(of({ id: 10 }));
    const request = { userId: '42' } as Request & { userId: string };
    const input = {
      description: 'A new post',
      imageIds: ['11111111-1111-4111-8111-111111111111'],
    };

    await expect(firstValueFrom(controller.createPost(input, request))).resolves.toEqual({ id: 10 });

    expect(createPost).toHaveBeenCalledWith({
      userId: '42',
      description: 'A new post',
      imageIds: input.imageIds,
    });
  });

  it('forwards post update with the authenticated user ID', async () => {
    updatePost.mockReturnValue(of({}));
    const request = { userId: '42' } as Request & { userId: string };
    const input = {
      description: 'Updated post',
    };

    await expect(controller.updatePost(1, input, request)).resolves.toEqual({});

    expect(updatePost).toHaveBeenCalledOnce();
    expect(updatePost).toHaveBeenCalledWith({
      userId: '42',
      postId: '1',
      description: 'Updated post',
    });
  });
  it('forwards post deletion with the authenticated user ID', async () => {
    deletePost.mockReturnValue(of({}));
    const request = { userId: '42' } as Request & { userId: string };

    await expect(controller.deletePost(1, request)).resolves.toBeUndefined();

    expect(deletePost).toHaveBeenCalledOnce();
    expect(deletePost).toHaveBeenCalledWith({
      userId: '42',
      postId: '1',
    });
  });
});
