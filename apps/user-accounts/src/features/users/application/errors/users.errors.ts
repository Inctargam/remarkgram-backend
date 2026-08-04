import {
  UserAccountsError,
  UserAccountsErrorCode,
} from '../../../../common/application/errors/user-accounts.error.js';

export class UsernameAlreadyExistsError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.USERNAME_ALREADY_EXISTS;

  constructor() {
    super('Username already exists');
  }
}

export class EmailAlreadyExistsError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.EMAIL_ALREADY_EXISTS;

  constructor() {
    super('Email already exists');
  }
}

export class InvalidConfirmationCodeError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INVALID_CONFIRMATION_CODE;

  constructor() {
    super('Confirmation code is invalid');
  }
}

export class EmailAlreadyConfirmedError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.EMAIL_ALREADY_CONFIRMED;

  constructor() {
    super('Email is already confirmed');
  }
}

export class ConfirmationCodeExpiredError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.CONFIRMATION_CODE_EXPIRED;

  constructor() {
    super('Confirmation code has expired');
  }
}

export class IncorrectEmailError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INCORRECT_EMAIL;

  constructor() {
    super('Email is incorrect');
  }
}
