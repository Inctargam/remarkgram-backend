import { PostsError, PostsErrorCode } from './posts.error.js';

export class PostNotFoundError extends PostsError {
  readonly code = PostsErrorCode.POST_NOT_FOUND;

  constructor() {
    super(`Post not found`);
  }
}

export class PostAccessForbiddenError extends PostsError {
  readonly code = PostsErrorCode.POST_ACCESS_FORBIDDEN;
  constructor(public message: string = 'Access to this post is forbidden') {
    super(message);
  }
}

export class InvalidPostIdError extends PostsError {
  readonly code = PostsErrorCode.INVALID_POST_ID;
  constructor() {
    super(`Invalid post id`);
  }
}
