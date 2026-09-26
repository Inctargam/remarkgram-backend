import { Error as DBOSErrors } from '@dbos-inc/dbos-sdk';
import {
  ImageUploadsServiceUnavailableError,
  PostImageAlreadyAttachedError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../application/errors/create-post.errors.js';
import { PostsError, PostsErrorCode } from '../../application/errors/posts.error.js';

// SDK сохраняет dbosErrorCode при сериализации, но не исходный класс ошибки.
const maxStepRetriesErrorCode = new DBOSErrors.DBOSMaxStepRetriesError('', 0, []).dbosErrorCode;

const postsErrorTypes = new Map<string, new () => PostsError>([
  [PostsErrorCode.POST_IMAGE_NOT_FOUND, PostImageNotFoundError],
  [PostsErrorCode.POST_IMAGES_NOT_AVAILABLE, PostImagesNotAvailableError],
  [PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED, PostImageAlreadyAttachedError],
  [PostsErrorCode.IMAGE_UPLOADS_SERVICE_UNAVAILABLE, ImageUploadsServiceUnavailableError],
]);

// Ошибка шага может прийти из БД без исходного класса. При отсутствии code
// распознаём name, сохраняемый Prisma datasource. Неизвестный code не подменяем.
export function getPostsErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error) return typeof error.code === 'string' ? error.code : undefined;
  if (error instanceof Error) {
    for (const [code, ErrorType] of postsErrorTypes) {
      if (error.name === ErrorType.name) return code;
    }
  }
  return undefined;
}

// В execute восстанавливаем класс для gRPC-фильтра: getResult может вернуть ошибку
// из истории без выполнения тела workflow. Исходный экземпляр возвращаем как есть.
export function restorePostsError(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'dbosErrorCode' in error &&
    error.dbosErrorCode === maxStepRetriesErrorCode &&
    'errors' in error &&
    Array.isArray(error.errors) &&
    error.errors.length > 0 &&
    error.errors.every(
      (cause: unknown) => getPostsErrorCode(cause) === PostsErrorCode.IMAGE_UPLOADS_SERVICE_UNAVAILABLE,
    )
  ) {
    return new ImageUploadsServiceUnavailableError();
  }
  if (error instanceof PostsError) return error;
  const code = getPostsErrorCode(error);
  const ErrorType = code === undefined ? undefined : postsErrorTypes.get(code);
  return ErrorType ? new ErrorType() : error;
}
