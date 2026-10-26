import { Injectable, Logger } from '@nestjs/common';
import { PostsQueryRepository } from '../../../application/ports/posts-query.repository.js';
import { PrismaService } from '../prisma.service.js';
import { type FindAuthorPostsPageParams } from '../../../application/types/posts.types.js';
import { PostViewMapper } from '../mappers/post-view.mapper.js';

@Injectable()
export class PrismaPostsQueryRepository implements PostsQueryRepository {
  readonly logger = new Logger(PrismaPostsQueryRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async findAuthorPostsPage(params: FindAuthorPostsPageParams) {
    const { authorId, limit, cursor = null } = params;
    const take = limit + 1;

    const posts = await this.prisma.post.findMany({
      take: take,
      where: { authorId: authorId, deletedAt: null, publishedAt: { not: null } },
      include: {
        images: {
          orderBy: { position: 'asc' },
        },
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        { id: 'desc' },
      ],
      cursor: cursor ? cursor : undefined,
    });
    const hasMore = posts.length > limit;
    const items = posts.slice(0, limit);
    const nextCursor = posts.at(-1);

    return {
      items: items.map((post) => PostViewMapper.toView(post)),
      nextCursor:
        nextCursor && hasMore
          ? {
              id: nextCursor.id,
              createdAt: nextCursor.createdAt,
            }
          : null,
      hasMore: hasMore,
    };
  }
}
