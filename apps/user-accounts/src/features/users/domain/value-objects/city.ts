const CITY_MAX_LENGTH = 100;
const CITY_PATTERN = /^[\p{L}\s'’.-]+$/u;

export class City {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }
  private static assertValid(value: string): void {
    if (!value) {
      throw new Error('City cannot be empty');
    }

    if (value.length > CITY_MAX_LENGTH) {
      throw new Error(`City must not exceed ${CITY_MAX_LENGTH} characters`);
    }

    if (!CITY_PATTERN.test(value)) {
      throw new Error('City has an invalid format');
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
