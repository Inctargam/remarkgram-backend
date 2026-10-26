import { describe, expect, it } from 'vitest';
import { PostPrismaMapper } from './post-prisma.mapper.js';

describe('PostPrismaMapper', () => {
  it('maps a post and its ordered images to the domain', () => {
    const createdAt = new Date('2026-08-10T00:00:00.000Z');

    const post = PostPrismaMapper.toDomain({
      id: 1,
      authorId: 2,
      description: 'description',
      createdAt,
      publishedAt: createdAt,
      version: 3,
      deletedAt: null,
      images: [{ fileId: '22222222-2222-4222-8222-222222222222', postId: 1, position: 0 }],
    });

    expect(post).toMatchObject({
      id: 1,
      authorId: 2,
      description: 'description',
      createdAt,
      version: 3,
      deletedAt: null,
      images: [{ fileId: '22222222-2222-4222-8222-222222222222', position: 0 }],
    });
  });
});
