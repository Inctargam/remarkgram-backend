import type { CreatePostRepositoryParams, UpdateAuthorPostRepositoryParams } from '../types/posts.types.js';
import type { Post } from '../../domain/entities/post.entity.js';
import type { TransactionContext } from './unit-of-work.js';

export abstract class PostsRepository {
  abstract create(params: CreatePostRepositoryParams, ctx?: TransactionContext): Promise<number>;
  abstract publish(id: number, ctx?: TransactionContext): Promise<void>;
  abstract findById(id: number): Promise<Post | null>;
  abstract updateAuthorPost(params: UpdateAuthorPostRepositoryParams): Promise<number>;
}
