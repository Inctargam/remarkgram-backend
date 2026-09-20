import {
  UserAccountsError,
  UserAccountsErrorCode,
} from '../../../../common/application/errors/user-accounts.error.js';
import { PERSONAL_INFO_NAME_PATTERN } from '@app/user-accounts-grpc';

export class InvalidPersonalInfoFirstNameError extends UserAccountsError {
  code = UserAccountsErrorCode.INVALID_PERSONAL_INFO_FIRST_NAME;
  constructor(min: number, max: number) {
    super(`First name must be between ${min} and ${max} characters and match ${PERSONAL_INFO_NAME_PATTERN}.`);
  }
}

export class InvalidPersonalInfoLastNameError extends UserAccountsError {
  code = UserAccountsErrorCode.INVALID_PERSONAL_INFO_LAST_NAME;
  constructor(min: number, max: number) {
    super(`Last name must be between ${min} and ${max} characters and match ${PERSONAL_INFO_NAME_PATTERN}.`);
  }
}

export class InvalidPersonalInfoAboutMeError extends UserAccountsError {
  code = UserAccountsErrorCode.INVALID_PERSONAL_INFO_ABOUT_ME;
  constructor(max: number) {
    super(`About me must at more than  ${max} characters long.`);
  }
}
