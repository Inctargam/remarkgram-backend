import {
  UserAccountsError,
  UserAccountsErrorCode,
} from '../../../../common/application/errors/user-accounts.error.js';

export class InvalidAvatarFileIdError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INVALID_AVATAR_FILE_ID;

  constructor() {
    super('fileId must be a UUID v4');
  }
}

export class InvalidIdempotencyKeyError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INVALID_IDEMPOTENCY_KEY;

  constructor() {
    super('Idempotency-Key must be a UUID v4');
  }
}

export class AvatarUpdateConflictError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.AVATAR_UPDATE_CONFLICT;

  constructor() {
    super('An avatar update is already in progress');
  }
}

export class AvatarIdempotencyKeyConflictError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.AVATAR_IDEMPOTENCY_KEY_CONFLICT;

  constructor() {
    super('Idempotency-Key was already used with another fileId');
  }
}

export class AvatarFileNotFoundError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.AVATAR_FILE_NOT_FOUND;

  constructor() {
    super('Avatar file was not found');
  }
}

export class AvatarFileStateConflictError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.AVATAR_FILE_STATE_CONFLICT;

  constructor() {
    super('Avatar file is in a state that does not allow this operation');
  }
}

export class InvalidAvatarImageError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INVALID_AVATAR_IMAGE;

  constructor() {
    super('The photo must be less than 10 Mb and have JPEG or PNG format');
  }
}

export class AvatarFilesUnavailableError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.AVATAR_FILES_UNAVAILABLE;

  constructor() {
    super('Files service is temporarily unavailable');
  }
}
