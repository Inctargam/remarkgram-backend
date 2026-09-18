const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export class CountryCode {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }
  private static assertValid(value: string): void {
    if (!COUNTRY_CODE_PATTERN.test(value)) {
      throw new Error('Country code must be an ISO 3166-1 alpha-2 code');
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
