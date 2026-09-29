import {
  PERSONAL_INFO_CITY_MAX_LENGTH,
  PERSONAL_INFO_CITY_MIN_LENGTH,
  PERSONAL_INFO_CITY_PATTERN,
} from '@app/user-accounts-grpc';
import { InvalidCityError } from '../../application/errors/location-info.errors.js';

export class City {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }
  private static assertValid(value: string): void {
    if (
      value.length < PERSONAL_INFO_CITY_MIN_LENGTH ||
      value.length > PERSONAL_INFO_CITY_MAX_LENGTH ||
      !PERSONAL_INFO_CITY_PATTERN.test(value)
    ) {
      throw new InvalidCityError();
    }
  }
  public static create(value: string): City {
    const normalizedValue = value.trim().normalize('NFC');

    City.assertValid(normalizedValue);

    return new City(normalizedValue);
  }

  public static restore(value: string): City {
    City.assertValid(value);

    return new City(value);
  }
}
