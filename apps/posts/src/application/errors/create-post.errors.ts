import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH, MIN_IMAGES_PER_POST } from '@app/posts-grpc';
import { PostsError, PostsErrorCode } from './posts.error.js';

export class InvalidUserIdError extends PostsError {
  readonly code = PostsErrorCode.INVALID_USER_ID;

  constructor() {
    super('User ID must be a positive integer');
  }
}

export class InvalidPostDescriptionError extends PostsError {
  readonly code = PostsErrorCode.INVALID_POST_DESCRIPTION;

  constructor() {
    super(`Post description must not exceed ${MAX_POST_DESCRIPTION_LENGTH} characters`);
  }
}

export class InvalidPostImageCountError extends PostsError {
  readonly code = PostsErrorCode.INVALID_POST_IMAGE_COUNT;

  constructor() {
    super(`Post image count must be between ${MIN_IMAGES_PER_POST} and ${MAX_IMAGES_PER_POST}`);
  }
}

export class DuplicatePostImageIdError extends PostsError {
  readonly code = PostsErrorCode.DUPLICATE_POST_IMAGE_ID;

  constructor() {
    super('Post image IDs must be unique');
  }
}

export class InvalidPostIdempotencyKeyError extends PostsError {
  readonly code = PostsErrorCode.INVALID_POST_IDEMPOTENCY_KEY;

  constructor() {
    super('Idempotency-Key must be a UUID v4');
  }
}

export class PostIdempotencyKeyConflictError extends PostsError {
  readonly code = PostsErrorCode.POST_IDEMPOTENCY_KEY_CONFLICT;

  constructor() {
    super('Idempotency-Key has already been used for another post creation request');
  }
}

export class PostImageNotFoundError extends PostsError {
  readonly code = PostsErrorCode.POST_IMAGE_NOT_FOUND;

  constructor() {
    super('One or more post images were not found');
  }
}

export class PostImagesNotAvailableError extends PostsError {
  readonly code = PostsErrorCode.POST_IMAGES_NOT_AVAILABLE;

  constructor() {
    super('One or more post images are not available');
  }
}

export class PostImageAlreadyAttachedError extends PostsError {
  readonly code = PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED;

  constructor() {
    super('One or more images are already attached to a post');
  }
}

export class ImageUploadsServiceUnavailableError extends PostsError {
  readonly code = PostsErrorCode.IMAGE_UPLOADS_SERVICE_UNAVAILABLE;

  constructor() {
    super('The image uploads service is unavailable');
  }
}
