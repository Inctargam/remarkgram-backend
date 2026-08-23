import { PostImageAlreadyAttachedError } from '../../../application/errors/create-post.errors.js';
import { Prisma } from '../generated/client.js';
import type { PrismaService } from '../prisma.service.js';
import { PrismaPostsRepository } from './prisma-posts.repository.js';
import { describe, expect } from 'vitest';
import { PostUpdateConflictError } from '../../../application/errors/update-post.errors.js';

describe('PrismaPostsRepository', () => {
  const create = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const prisma = {
    post: { create, findUnique, update },
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

    findUnique.mockReset();
    update.mockReset();
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

  it('publishes a post through the supplied transaction client', async () => {
    const transactionUpdate = vi.fn().mockResolvedValue({ id: 10 });
    const transaction = { post: { update: transactionUpdate } };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));

    await expect(repository.publish(10, transaction)).resolves.toBeUndefined();

    expect(transactionUpdate).toHaveBeenCalledWith({
      where: { id: 10, publishedAt: null, deletedAt: null },
      data: { publishedAt: new Date('2030-01-01T00:00:00.000Z') },
      select: { id: true },
    });
    vi.useRealTimers();
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

  it('maps a stale version update to PostUpdateConflictError', async () => {
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record to update not found', {
        code: 'P2025',
        clientVersion: '7.8.0',
      }),
    );

    await expect(
      repository.updateAuthorPost({
        id: 1,
        authorId: 2,
        expectedVersion: 0,
        fields: {
          description: 'updated',
        },
      }),
    ).rejects.toBeInstanceOf(PostUpdateConflictError);
  });
  it('updates a post only when the expected version matches', async () => {
    update.mockResolvedValue({ id: 1 });

    await expect(
      repository.updateAuthorPost({
        id: 1,
        authorId: 2,
        expectedVersion: 3,
        fields: {
          description: 'updated',
        },
      }),
    ).resolves.toBe(1);

    expect(update).toHaveBeenCalledWith({
      where: {
        authorId: 2,
        deletedAt: null,
        id: 1,
        version: 3,
      },
      data: {
        description: 'updated',
        version: {
          increment: 1,
        },
      },
      select: {
        id: true,
      },
    });
  });

  it('maps a persisted post with images to the domain', async () => {
    const createdAt = new Date('2026-08-10T00:00:00.000Z');
    findUnique.mockResolvedValue({
      id: 1,
      authorId: 2,
      description: 'description',
      createdAt,
      version: 3,
      deletedAt: null,
      images: [{ fileId: params.imageIds[0], postId: 1, position: 0 }],
    });

    await expect(repository.findById(1)).resolves.toMatchObject({
      id: 1,
      authorId: 2,
      description: 'description',
      images: [{ fileId: params.imageIds[0], position: 0 }],
      version: 3,
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 1, deletedAt: null },
      include: { images: { orderBy: { position: 'asc' } } },
    });
  });
});
