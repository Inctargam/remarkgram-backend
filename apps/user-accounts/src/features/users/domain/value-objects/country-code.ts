import { PERSONAL_INFO_COUNTRY_CODE_PATTERN } from '@app/user-accounts-grpc';
import { InvalidCountryCodeError } from '../../application/errors/location-info.errors.js';

export class CountryCode {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }
  private static assertValid(value: string): void {
    if (!PERSONAL_INFO_COUNTRY_CODE_PATTERN.test(value)) {
      throw new InvalidCountryCodeError();
    }
  }
  public static create(value: string): CountryCode {
    const normalizedValue = value.trim().toUpperCase();

    CountryCode.assertValid(normalizedValue);

    return new CountryCode(normalizedValue);
  }

  public static restore(value: string): CountryCode {
    CountryCode.assertValid(value);

    return new CountryCode(value);
  }
}
