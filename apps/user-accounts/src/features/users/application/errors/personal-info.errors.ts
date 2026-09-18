import {
  UserAccountsError,
  UserAccountsErrorCode,
} from '../../../../common/application/errors/user-accounts.error.js';

export class InvalidPersonalInfoFirstNameError extends UserAccountsError {
  code = UserAccountsErrorCode.INVALID_PERSONAL_INFO_FIRST_NAME;
  constructor(min: number, max: number) {
    super(`First name must be at lest ${min} and more than ${max} characters long.`);
  }
}

export class InvalidPersonalInfoLastNameError extends UserAccountsError {
  code = UserAccountsErrorCode.INVALID_PERSONAL_INFO_LAST_NAME;
  constructor(min: number, max: number) {
    super(`Last name must be at lest ${min} and more than ${max} characters long.`);
  }
}

export class InvalidPersonalInfoAboutMeError extends UserAccountsError {
  code = UserAccountsErrorCode.INVALID_PERSONAL_INFO_ABOUT_ME;
  constructor(max: number) {
    super(`About me must at more than  ${max} characters long.`);
  }
}
