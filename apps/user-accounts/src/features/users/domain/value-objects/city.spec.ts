import { describe, expect, it } from 'vitest';
import { PERSONAL_INFO_CITY_MAX_LENGTH } from '@app/user-accounts-grpc';
import { City } from './city.js';
import { InvalidCityError } from '../../application/errors/location-info.errors.js';

describe('City VO', () => {
  it('normalizes whitespace and Unicode', () => {
    expect(City.create('  Київ  ').value).toBe('Київ');
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
});
