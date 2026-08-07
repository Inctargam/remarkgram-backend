import type { CreatePostRepositoryParams } from '../types/posts.types.js';

export type UpdateAuthorPostParams = {
  id: number;
  authorId: number;
  expectedVersion: number;
  fields: {
    description: string;
  };
};

export type PostForUpdate = {
  id: number;
  authorId: number;
  version: number;
};

export abstract class PostsRepository {
  abstract create(params: CreatePostRepositoryParams): Promise<number>;
  abstract findById(id: number): Promise<PostForUpdate | null>;
  abstract updateAuthorPost(params: UpdateAuthorPostParams): Promise<number>;
}
