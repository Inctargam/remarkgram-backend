import {
  PERSONAL_INFO_CITY_MAX_LENGTH,
  PERSONAL_INFO_CITY_MIN_LENGTH,
  PERSONAL_INFO_CITY_PATTERN,
  PERSONAL_INFO_COUNTRY_CODE_PATTERN,
} from '@app/user-accounts-grpc';
import {
  UserAccountsError,
  UserAccountsErrorCode,
} from '../../../../common/application/errors/user-accounts.error.js';

export class InvalidCountryCodeError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INVALID_COUNTRY_CODE;

  constructor() {
    super(`Country code must match ${PERSONAL_INFO_COUNTRY_CODE_PATTERN}`);
  }
}

export class InvalidCityError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.INVALID_CITY;

  constructor() {
    super(
      `City must be between ${PERSONAL_INFO_CITY_MIN_LENGTH} and ${PERSONAL_INFO_CITY_MAX_LENGTH} characters and match ${PERSONAL_INFO_CITY_PATTERN}`,
    );
  }
}
