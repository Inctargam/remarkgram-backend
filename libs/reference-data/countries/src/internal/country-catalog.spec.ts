import { describe, expect } from 'vitest';
import { CountryCatalog } from './country-catalog.js';

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

  it('maps result to search return', () => {
    const records = catalog.search('ua', { limit: 10 });
    expect(records).toBeInstanceOf(Array);
    expect(records).toContainEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      alpha2: expect.any(String),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      alpha3: expect.any(String),
      names: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        en: expect.any(String),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        ru: expect.any(String),
      },
    });
  });
});
