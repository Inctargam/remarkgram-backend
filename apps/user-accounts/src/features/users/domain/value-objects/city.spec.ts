import { describe, expect, it } from 'vitest';
import { PERSONAL_INFO_CITY_MAX_LENGTH, PERSONAL_INFO_CITY_MIN_LENGTH } from '@app/user-accounts-grpc';
import { City } from './city.js';
import { InvalidCityError } from '../../application/errors/location-info.errors.js';

describe('City VO', () => {
  it('trims whitespace and normalizes Unicode to NFC', () => {
    expect(City.create('  Saint-Étienne  ').value).toBe('Saint-Étienne');
  });

  it.each(['a'.repeat(PERSONAL_INFO_CITY_MIN_LENGTH), 'a'.repeat(PERSONAL_INFO_CITY_MAX_LENGTH)])(
    'accepts a city at a configured length boundary',
    (value) => {
      expect(City.create(value).value).toBe(value);
    },
  );

  it.each(['New York', 'L’viv', 'Baden-Baden', 'St. Louis', '李'])('accepts city pattern %j', (value) => {
    expect(City.create(value).value).toBe(value);
  });

  it.each(['', 'Kyiv123', 'Kyiv@'])('rejects invalid city %j', (value) => {
    expect(() => City.create(value)).toThrow(InvalidCityError);
  });

  it('rejects a city exceeding the maximum length', () => {
    const value = 'a'.repeat(PERSONAL_INFO_CITY_MAX_LENGTH + 1);

    expect(() => City.create(value)).toThrow(InvalidCityError);
  });

  it('rejects an invalid restored value with a domain error', () => {
    expect(() => City.restore('Kyiv123')).toThrow(InvalidCityError);
  });

  it('restores a valid persisted value', () => {
    expect(City.restore('Київ').value).toBe('Київ');
  });
});
