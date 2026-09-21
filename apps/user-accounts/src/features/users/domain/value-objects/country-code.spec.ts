import { describe, expect, it } from 'vitest';
import { CountryCode } from './country-code.js';
import { InvalidCountryCodeError } from '../../application/errors/location-info.errors.js';

describe('CountryCode VO', () => {
  it('normalizes an ISO 3166-1 alpha-2 code', () => {
    expect(CountryCode.create(' ua ').value).toBe('UA');
  });

  it.each(['UA', 'US', 'GB'])('accepts alpha-2 code %s', (value) => {
    expect(CountryCode.create(value).value).toBe(value);
  });

  it.each(['U', 'UKR', 'U1', 'Україна', ''])('rejects invalid country code %j', (value) => {
    expect(() => CountryCode.create(value)).toThrow(InvalidCountryCodeError);
  });

  it('rejects an invalid restored value with a domain error', () => {
    expect(() => CountryCode.restore('ua')).toThrow(InvalidCountryCodeError);
  });

  it('restores a valid persisted value without normalization', () => {
    expect(CountryCode.restore('UA').value).toBe('UA');
  });
});
