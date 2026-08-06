import {
  UserAccountsError,
  UserAccountsErrorCode,
} from '../../../../common/application/errors/user-accounts.error.js';

export class NoActiveSessionError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.NO_ACTIVE_SESSION;

  constructor() {
    super('No active session found');
  }
}

export class SessionNotFoundError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.SESSION_NOT_FOUND;

  constructor() {
    super('Session not found');
  }
}

export class SessionAccessDeniedError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.SESSION_ACCESS_DENIED;

  constructor() {
    super('Access denied');
  }
}

export class InvalidUserIdError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INVALID_USER_ID;

  constructor() {
    super('Unauthorized');
  }
}
