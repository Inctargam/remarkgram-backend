import { PostsError, PostsErrorCode } from './posts.error.js';

export class InvalidPostsPageLimitError extends PostsError {
  readonly code = PostsErrorCode.INVALID_POST_PAGE_LIMIT;
  constructor() {
    super('Invalid posts page limit');
  }
}

export class InvalidPostsCursorError extends PostsError {
  readonly code = PostsErrorCode.INVALID_POST_CURSOR;
  constructor() {
    super('Invalid posts cursor');
  }
}
