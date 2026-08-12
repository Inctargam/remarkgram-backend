import { Post } from '../../../domain/entities/post.entity.js';
import type { PostModel } from '../generated/models/Post.js';
import type { PostImageModel } from '../generated/models/PostImage.js';
import { PostImagePrismaMapper } from './post-image-prisma.mapper.js';

type PostWithImages = PostModel & {
  images: PostImageModel[];
};

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
