import {
  UserAccountsError,
  UserAccountsErrorCode,
} from '../../../../common/application/errors/user-accounts.error.js';
import { BIRTH_DATE_FORMAT, BIRTH_DATE_MIN_ALLOWED_AGE } from '@app/user-accounts-grpc';

export class InvalidBirthDateFormatError extends UserAccountsError {
  code = UserAccountsErrorCode.INVALID_BIRTH_DATE_FORMAT;
  constructor() {
    super(`Invalid date format; expected ${BIRTH_DATE_FORMAT}`);
  }
}

export class NonExistentCalendarDateError extends UserAccountsError {
  code = UserAccountsErrorCode.NON_EXISTENT_CALENDAR_DATE;
  constructor() {
    super('The specified calendar date does not exist');
  }
}
export class BirthDateMinAllowedAgeError extends UserAccountsError {
  code = UserAccountsErrorCode.BIRTH_DATE_MIN_ALLOWED_AGE;

  constructor() {
    super(`Users must be at least ${BIRTH_DATE_MIN_ALLOWED_AGE} years old`);
  }
}
