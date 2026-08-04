import { PostImageAlreadyAttachedError } from '../../../application/errors/create-post.errors.js';
import { Prisma } from '../generated/client.js';
import type { PrismaService } from '../prisma.service.js';
import { PrismaPostsRepository } from './prisma-posts.repository.js';

describe('PrismaPostsRepository', () => {
  const create = vi.fn();
  const prisma = {
    post: { create },
  };
  const repository = new PrismaPostsRepository(prisma as unknown as PrismaService);
  const params = {
    authorId: 42,
    description: 'A new post',
    imageIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
  };

  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ id: 10 });
  });

  it('atomically creates a post with ordered images', async () => {
    await expect(repository.create(params)).resolves.toBe(10);

    expect(create).toHaveBeenCalledWith({
      data: {
        authorId: 42,
        description: 'A new post',
        images: {
          create: [
            { fileId: params.imageIds[0], position: 0 },
            { fileId: params.imageIds[1], position: 1 },
          ],
        },
      },
      select: { id: true },
    });
  });

  it('maps a unique constraint violation to an application error', async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );

    await expect(repository.create(params)).rejects.toBeInstanceOf(PostImageAlreadyAttachedError);
  });

  it('does not hide an unrelated persistence error', async () => {
    const error = new Error('Database is unavailable');
    create.mockRejectedValue(error);

    await expect(repository.create(params)).rejects.toBe(error);
  });
});
