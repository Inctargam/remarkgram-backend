import type { CreatePostRepositoryParams } from '../types/posts.types.js';

export abstract class PostsRepository {
  abstract create(params: CreatePostRepositoryParams): Promise<number>;
}
