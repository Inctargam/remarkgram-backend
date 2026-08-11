import type { CreatePostRepositoryParams, UpdateAuthorPostRepositoryParams } from '../types/posts.types.js';
import type { Post } from '../../domain/entities/post.entity.js';

export abstract class PostsRepository {
  abstract create(params: CreatePostRepositoryParams): Promise<number>;
  abstract findById(id: number): Promise<Post | null>;
  abstract updateAuthorPost(params: UpdateAuthorPostRepositoryParams): Promise<number>;
}
