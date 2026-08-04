import {
  UserAccountsError,
  UserAccountsErrorCode,
} from '../../../../common/application/errors/user-accounts.error.js';

export class InvalidPasswordResetTokenError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INVALID_PASSWORD_RESET_TOKEN;

  constructor() {
    super('Reset link is invalid or expired.');
  }
}
