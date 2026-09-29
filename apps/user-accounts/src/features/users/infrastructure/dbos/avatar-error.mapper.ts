import { Error as DBOSErrors } from '@dbos-inc/dbos-sdk';
import {
  UserAccountsError,
  UserAccountsErrorCode as Code,
} from '../../../../common/application/errors/user-accounts.error.js';
import {
  InvalidAvatarFileIdError,
  InvalidIdempotencyKeyError,
  AvatarUpdateConflictError,
  AvatarIdempotencyKeyConflictError,
  AvatarFileNotFoundError,
  AvatarFileStateConflictError,
  InvalidAvatarImageError,
  AvatarFilesUnavailableError,
} from '../../application/errors/avatar.errors.js';
import { UserNotFoundError } from '../../application/errors/users.errors.js';

// SDK сохраняет dbosErrorCode при сериализации, но не исходный класс ошибки.
const maxStepRetriesErrorCode = new DBOSErrors.DBOSMaxStepRetriesError('', 0, []).dbosErrorCode;

const avatarErrorTypes = new Map<string, new () => UserAccountsError>([
  [Code.INVALID_AVATAR_FILE_ID, InvalidAvatarFileIdError],
  [Code.INVALID_IDEMPOTENCY_KEY, InvalidIdempotencyKeyError],
  [Code.AVATAR_UPDATE_CONFLICT, AvatarUpdateConflictError],
  [Code.AVATAR_IDEMPOTENCY_KEY_CONFLICT, AvatarIdempotencyKeyConflictError],
  [Code.AVATAR_FILE_NOT_FOUND, AvatarFileNotFoundError],
  [Code.AVATAR_FILE_STATE_CONFLICT, AvatarFileStateConflictError],
  [Code.INVALID_AVATAR_IMAGE, InvalidAvatarImageError],
  [Code.AVATAR_FILES_UNAVAILABLE, AvatarFilesUnavailableError],
  [Code.USER_NOT_FOUND, UserNotFoundError],
]);

// Ошибка шага может прийти из БД без исходного класса. При отсутствии code
// распознаём name, сохраняемый Prisma datasource. Неизвестный code не подменяем.
export function getAvatarErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error) return typeof error.code === 'string' ? error.code : undefined;
  if (error instanceof Error) {
    for (const [code, ErrorType] of avatarErrorTypes) {
      if (error.name === ErrorType.name) return code;
    }
  }
  return undefined;
}

// В execute восстанавливаем класс для gRPC-фильтра: getResult может вернуть ошибку
// из истории без выполнения тела workflow. Исходный экземпляр возвращаем как есть.
export function restoreAvatarError(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'dbosErrorCode' in error &&
    error.dbosErrorCode === maxStepRetriesErrorCode &&
    'errors' in error &&
    Array.isArray(error.errors) &&
    error.errors.length > 0 &&
    error.errors.every((cause: unknown) => getAvatarErrorCode(cause) === Code.AVATAR_FILES_UNAVAILABLE)
  ) {
    return new AvatarFilesUnavailableError();
  }
  if (error instanceof UserAccountsError) return error;
  const code = getAvatarErrorCode(error);
  const ErrorType = code === undefined ? undefined : avatarErrorTypes.get(code);
  return ErrorType ? new ErrorType() : error;
}
