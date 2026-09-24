import { getAvatarErrorCode, restoreAvatarError } from './avatar-error.mapper.js';
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
import {
  UserAccountsError,
  UserAccountsErrorCode as Code,
} from '../../../../common/application/errors/user-accounts.error.js';

const cases = [
  {
    ErrorType: InvalidAvatarFileIdError,
    code: Code.INVALID_AVATAR_FILE_ID,
    message: 'fileId must be a UUID v4',
  },
  {
    ErrorType: InvalidIdempotencyKeyError,
    code: Code.INVALID_IDEMPOTENCY_KEY,
    message: 'Idempotency-Key must be a UUID v4',
  },
  {
    ErrorType: AvatarUpdateConflictError,
    code: Code.AVATAR_UPDATE_CONFLICT,
    message: 'An avatar update is already in progress',
  },
  {
    ErrorType: AvatarIdempotencyKeyConflictError,
    code: Code.AVATAR_IDEMPOTENCY_KEY_CONFLICT,
    message: 'Idempotency-Key was already used with another fileId',
  },
  {
    ErrorType: AvatarFileNotFoundError,
    code: Code.AVATAR_FILE_NOT_FOUND,
    message: 'Avatar file was not found',
  },
  {
    ErrorType: AvatarFileStateConflictError,
    code: Code.AVATAR_FILE_STATE_CONFLICT,
    message: 'Avatar file is in a state that does not allow this operation',
  },
  {
    ErrorType: InvalidAvatarImageError,
    code: Code.INVALID_AVATAR_IMAGE,
    message: 'The photo must be less than 10 Mb and have JPEG or PNG format',
  },
  {
    ErrorType: AvatarFilesUnavailableError,
    code: Code.AVATAR_FILES_UNAVAILABLE,
    message: 'Files service is temporarily unavailable',
  },
];

describe('avatar error recovery', () => {
  it.each(cases)(
    'restores $code from a checkpoint with the application code',
    ({ ErrorType, code, message }) => {
      const restored = restoreAvatarError({ code });
      expect(restored).toBeInstanceOf(ErrorType);
      expect(restored).toBeInstanceOf(UserAccountsError);
      expect(restored).toMatchObject({ code, message });
    },
  );

  it.each(cases)(
    'restores $code by the concrete error name when code was lost',
    ({ ErrorType, code, message }) => {
      const replay = Object.assign(new Error(message), { name: ErrorType.name });
      expect(restoreAvatarError(replay)).toBeInstanceOf(ErrorType);
      expect(restoreAvatarError(replay)).toMatchObject({ code, message });
    },
  );

  it.each(cases)('preserves the original $code instance and stack', ({ ErrorType }) => {
    const error = new ErrorType();
    expect(restoreAvatarError(error)).toBe(error);
  });

  it('restores UserNotFoundError without custom properties', () => {
    const replay = Object.assign(new Error('User Not Found'), { name: 'UserNotFoundError' });
    expect(restoreAvatarError(replay)).toBeInstanceOf(UserNotFoundError);
  });

  it.each([
    null,
    undefined,
    'unexpected',
    new Error('An avatar update is already in progress'),
    Object.assign(new Error('disconnected'), { code: 'P1017' }),
    Object.assign(new Error('unknown code'), { code: 'UNKNOWN', name: 'UserNotFoundError' }),
  ])('preserves unknown errors: %s', (error) => {
    expect(restoreAvatarError(error)).toBe(error);
  });
});

describe('getAvatarErrorCode', () => {
  it.each(cases)('reads $code from an original error and both checkpoint forms', ({ ErrorType, code }) => {
    expect(getAvatarErrorCode(new ErrorType())).toBe(code);
    expect(getAvatarErrorCode({ code })).toBe(code);
    expect(getAvatarErrorCode(Object.assign(new Error('stored'), { name: ErrorType.name }))).toBe(code);
  });

  it('preserves an unknown code instead of falling back to a known name', () => {
    const error = Object.assign(new Error('unexpected'), { code: 'P1017', name: 'UserNotFoundError' });
    expect(getAvatarErrorCode(error)).toBe('P1017');
  });

  it('does not classify a transport error by a matching name', () => {
    const error = Object.assign(new Error('transport'), { code: 14, name: 'UserNotFoundError' });
    expect(getAvatarErrorCode(error)).toBeUndefined();
  });

  it.each([null, undefined, 'unexpected', new Error('unexpected')])(
    'ignores unrecognized values: %s',
    (error) => {
      expect(getAvatarErrorCode(error)).toBeUndefined();
    },
  );
});
