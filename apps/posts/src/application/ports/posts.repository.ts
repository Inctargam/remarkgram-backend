import type {
  CreatePostRepositoryParams,
  SoftDeletePostRepositoryParams,
  SoftDeletePostResult,
  UpdateAuthorPostRepositoryParams,
} from '../types/posts.types.js';
import type { Post } from '../../domain/entities/post.entity.js';
import type { TransactionContext } from './unit-of-work.js';

export abstract class PostsRepository {
  abstract create(params: CreatePostRepositoryParams): Promise<number>;
  abstract findById(id: number): Promise<Post | null>;
  abstract updateAuthorPost(params: UpdateAuthorPostRepositoryParams): Promise<number>;
  abstract softDeleteById(
    params: SoftDeletePostRepositoryParams,
    ctx?: TransactionContext,
  ): Promise<SoftDeletePostResult | null>;
  abstract clearSoftDeleted(batchLimit: number): Promise<number>;
}
