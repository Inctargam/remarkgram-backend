import type { PrismaService } from '../prisma.service.js';
import { PrismaPostsQueryRepository } from './prisma-posts-query.repository.js';

describe('PrismaPostsQueryRepository', () => {
  const findMany = vi.fn();
  const prisma = { post: { findMany } };
  const repository = new PrismaPostsQueryRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it('does not return hidden posts while a DBOS workflow is still running', async () => {
    await expect(repository.findAuthorPostsPage({ authorId: 42, limit: 8, cursor: null })).resolves.toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    expect(findMany).toHaveBeenCalledWith({
      take: 9,
      where: { authorId: 42, deletedAt: null, publishedAt: { not: null } },
      include: { images: { orderBy: { position: 'asc' } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: undefined,
    });
  });
});
