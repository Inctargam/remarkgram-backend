import {
  UserAccountsError,
  UserAccountsErrorCode,
} from '../../../../common/application/errors/user-accounts.error.js';
import { USERNAME_PATTERN } from '@app/user-accounts-grpc';

export class InvalidUsernamePatternError extends UserAccountsError {
  code = UserAccountsErrorCode.INVALID_USERNAME_PATTERN;
  constructor() {
    super(`Username already in use: ${USERNAME_PATTERN}`);
  }
}

export class InvalidUsernameLengthError extends UserAccountsError {
  code = UserAccountsErrorCode.INVALID_USERNAME_LENGTH;
  constructor(minLength: number, maxLength: number) {
    super(
      `Username length
        must be between
        ${minLength} and
        ${maxLength}
        characters.`,
    );
  }
}
