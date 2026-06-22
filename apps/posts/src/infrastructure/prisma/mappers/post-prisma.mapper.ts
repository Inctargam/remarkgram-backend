import type { Post as PrismaPost } from '../generated/client.js';
import { Post } from '../../../domain/entities/post.entity.js';

export class PostPrismaMapper {
  static toDomain(row: PrismaPost): Post {
    return Post.restore(row);
  }
}
