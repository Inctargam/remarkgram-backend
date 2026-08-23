import type {
  GetOrCreatePostCreationOperationParams,
  PostCreationOperation,
  PostCreationOperationContext,
  TransitionPostCreationOperationParams,
} from '../types/post-creation-operation.types.js';

export abstract class PostCreationOperationsRepository {
  abstract getOrCreate(params: GetOrCreatePostCreationOperationParams): Promise<PostCreationOperation>;

  abstract findById(id: string): Promise<PostCreationOperation | null>;

  abstract transition(
    params: TransitionPostCreationOperationParams,
    ctx?: PostCreationOperationContext,
  ): Promise<boolean>;
}
