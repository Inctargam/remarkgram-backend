import { describe } from 'vitest';
import type { CountryRecord } from '../countries.data.js';
import { CountryMapper } from './country-view.mapper.js';

describe('CountryMapper', () => {
  const country = {
    alpha2: 'TEST',
    alpha3: 'TEST3',
    names: {
      ru: 'Title ru',
      en: 'Title en',
    },
    aliases: ['test1', 'test2', 'test3'],
  } satisfies CountryRecord;
  it('maps view presentation', () => {
    const view = CountryMapper.toView(country);
    expect(view).toEqual({
      code: country.alpha2,
      name: country.names,
    });
  });
});
