import {
  ImageUploadsServiceUnavailableError,
  PostImageAlreadyAttachedError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../application/errors/create-post.errors.js';
import { PostsErrorCode } from '../../application/errors/posts.error.js';

export const getDbosPostsErrorCode = (error: unknown): unknown =>
  error instanceof Error && 'code' in error ? error.code : undefined;

/**
 * DBOS сохраняет ошибки как сериализуемые данные. После восстановления workflow
 * объект может потерять prototype пользовательского класса, но сохраняет стабильный code.
 */
export const restoreDbosPostsError = (error: unknown): unknown => {
  switch (getDbosPostsErrorCode(error)) {
    case PostsErrorCode.POST_IMAGE_NOT_FOUND:
      return new PostImageNotFoundError();
    case PostsErrorCode.POST_IMAGES_NOT_AVAILABLE:
      return new PostImagesNotAvailableError();
    case PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED:
      return new PostImageAlreadyAttachedError();
    case PostsErrorCode.IMAGE_UPLOADS_SERVICE_UNAVAILABLE:
      return new ImageUploadsServiceUnavailableError();
    default:
      return error;
  }
};
