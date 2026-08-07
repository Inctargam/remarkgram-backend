import { PostsError, PostsErrorCode } from './posts.error.ts';
import { PostAccessForbiddenError } from './base-post.errors.ts';

export class PostUpdateForbiddenError extends PostAccessForbiddenError {
  constructor() {
    super();
  }
}

export class PostUpdateConflictError extends PostsError {
  readonly code = PostsErrorCode.POST_UPDATE_CONFLICT;

  constructor() {
    super('We were unable to save your changes. Please refresh the page and try again.');
  }
}
