import { describe, expect } from 'vitest';
import { CountryCatalog } from '@app/countries/internal/country-catalog.js';

describe('Country Catalog logic ', () => {
  const catalog = new CountryCatalog();
  it('should be initialized', () => {
    expect(catalog).not.toBeUndefined();
  });

  it('return the country by alpha', () => {
    const country = catalog.findByCode('ua');
    expect(country).toEqual({
      alpha2: 'UA',
      alpha3: 'UKR',
      names: {
        en: 'Ukraine',
        ru: 'Украина',
      },
      aliases: ['Україна'],
    });
  });
  it('return null if country not found', () => {
    const country = catalog.findByCode('tes');
    expect(country).toBeNull();
  });

  it('return an record country by search query', () => {
    const records = catalog.search('ов', { limit: 10 });
    // expect(records).toContainEqual([
    //
    // ])

  });
});
