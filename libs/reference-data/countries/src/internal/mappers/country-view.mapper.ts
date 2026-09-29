import { type CountryRecord } from '../countries.data.js';
import { type Country } from '../../application/country.types.js';

export class CountryMapper {
  static toView(record: CountryRecord): Country {
    return {
      code: record.alpha2,
      name: {
        ru: record.names.ru,
        en: record.names.en,
      },
    };
  }
}
