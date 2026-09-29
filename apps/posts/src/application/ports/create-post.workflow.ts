import type { CreatePostResult, CreatePostWorkflowParams } from '../types/posts.types.js';

/**
 * Application-слой знает только контракт процесса и не зависит от конкретного workflow engine.
 */
export abstract class CreatePostWorkflow {
  abstract execute(params: CreatePostWorkflowParams): Promise<CreatePostResult>;
}
