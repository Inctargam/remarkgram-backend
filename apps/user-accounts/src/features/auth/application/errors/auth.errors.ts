import { UserAccountsError, UserAccountsErrorCode } from '../../../../common/errors/user-accounts.error.js';

export class IncorrectCredentialsError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INCORRECT_CREDENTIALS;

  constructor() {
    super('Incorrect email/password');
  }
}

export class InvalidRefreshTokenError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INVALID_REFRESH_TOKEN;

  constructor() {
    super('Invalid refresh token');
  }
}

export class UserAlreadyLoggedInError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.USER_ALREADY_LOGGED_IN;

  constructor() {
    super('The user is already logged in');
  }
}

export class EmailNotConfirmedError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.EMAIL_NOT_CONFIRMED;

  constructor() {
    super('Email has not been confirmed');
  }
}
