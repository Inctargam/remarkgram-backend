import { Post } from '../../../domain/entities/post.entity.js';
import type { Prisma } from '../generated/client.js';
import { PostImagePrismaMapper } from './post-image-prisma.mapper.js';

type PostWithImages = Prisma.PostGetPayload<{ include: { images: true } }>;

export class PostPrismaMapper {
  static toDomain(row: PostWithImages): Post {
    return Post.restore({
      id: row.id,
      authorId: row.authorId,
      description: row.description,
      createdAt: row.createdAt,
      images: row.images.map((image) => PostImagePrismaMapper.toDomain(image)),
      version: row.version,
      deletedAt: row.deletedAt,
    });
  }
}
