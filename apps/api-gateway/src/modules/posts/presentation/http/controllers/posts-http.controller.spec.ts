import type { ClientGrpc } from '@nestjs/microservices';
import type { Request } from 'express';
import { firstValueFrom, of } from 'rxjs';
import { PostsHttpController } from './posts-http.controller.js';

describe('PostsHttpController', () => {
  const createPost = vi.fn();
  const grpcClient = {
    getService: vi.fn(() => ({ createPost })),
  };
  const controller = new PostsHttpController(grpcClient as unknown as ClientGrpc);

  beforeEach(() => {
    createPost.mockReset();
    grpcClient.getService.mockClear();
    controller.onModuleInit();
  });

  it('forwards post creation with the authenticated user ID', async () => {
    createPost.mockReturnValue(of({ id: 10 }));
    const request = { userId: '42' } as Request & { userId: string };
    const input = {
      description: 'A new post',
      imageIds: ['11111111-1111-4111-8111-111111111111'],
    };
    const idempotencyKey = '33333333-3333-4333-8333-333333333333';

    await expect(firstValueFrom(controller.createPost(input, request, idempotencyKey))).resolves.toEqual({
      id: 10,
    });

    expect(createPost).toHaveBeenCalledWith({
      userId: '42',
      description: 'A new post',
      imageIds: input.imageIds,
      idempotencyKey,
    });
  });
});
