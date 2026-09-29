import { beforeEach, describe, expect, it } from 'vitest';
import { CountryCatalog } from './country-catalog.js';

describe(CountryCatalog.name, () => {
  let catalog: CountryCatalog;

  beforeEach(() => {
    catalog = new CountryCatalog();
  });

  describe('findByCode', () => {
    it.each(['ua', ' UA ', 'ukr', ' UKR '])('finds a country by normalized code %j', (code) => {
      expect(catalog.findByCode(code)).toEqual({
        alpha2: 'UA',
        alpha3: 'UKR',
        names: {
          en: 'Ukraine',
          ru: 'Украина',
        },
        aliases: ['Україна'],
      });
    });

    it('returns null when a country does not exist', () => {
      expect(catalog.findByCode('ZZ')).toBeNull();
    });
  });

  describe('exists', () => {
    it('returns whether a normalized alpha-2 or alpha-3 code exists', () => {
      expect(catalog.exists(' ua ')).toBe(true);
      expect(catalog.exists('UKR')).toBe(true);
      expect(catalog.exists('ZZ')).toBe(false);
    });
  });

  describe('list', () => {
    it('uses the default limit when a limit is invalid', () => {
      expect(catalog.list({})).toHaveLength(20);
      expect(catalog.list({ limit: 0 })).toHaveLength(20);
      expect(catalog.list({ limit: Number.NaN })).toHaveLength(20);
    });

    it('honors a positive integer limit', () => {
      expect(catalog.list({ limit: 3 })).toHaveLength(3);
    });

    it('caps the requested limit at 100 countries', () => {
      expect(catalog.list({ limit: 101 })).toHaveLength(100);
    });
  });

  describe('search', () => {
    it.each([
      ['Ukraine', 'UA'],
      ['украина', 'UA'],
      ['Україна', 'UA'],
      ['Cote d’Ivoire', 'CI'],
    ])('finds %s using names, aliases, and accent-insensitive normalization', (term, code) => {
      expect(catalog.search(term, { limit: 10 }).map((country) => country.alpha2)).toContain(code);
    });

    it.each(['ua', ' UKR '])('returns only the exact country for code %j', (term) => {
      expect(catalog.search(term, { limit: 10 }).map((country) => country.alpha2)).toEqual(['UA']);
    });

    it('honors the result limit', () => {
      expect(catalog.search('united', { limit: 2 })).toHaveLength(2);
    });

    it('uses the default limit when a limit is invalid', () => {
      expect(catalog.search('a', { limit: 0 })).toHaveLength(20);
    });

    it('caps the result limit at 100 countries', () => {
      expect(catalog.search('a', { limit: 101 }).length).toBeLessThanOrEqual(100);
    });

    it('returns an empty array when no country matches', () => {
      expect(catalog.search('NotExistingCountry', { limit: 10 })).toEqual([]);
    });

    it('rejects a non-string search term', () => {
      expect(() => catalog.search(42 as unknown as string, { limit: 10 })).toThrow(
        new TypeError('Search term must be a string.'),
      );
    });

    it('rejects a term without Unicode letters', () => {
      expect(() => catalog.search('123-!?', { limit: 10 })).toThrow(
        'Search term "123-!?" must contain only Unicode-variant.',
      );
    });
  });
});
