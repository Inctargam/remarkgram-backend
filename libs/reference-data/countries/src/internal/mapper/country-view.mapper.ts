import { type CountryRecord } from '@app/countries/internal/countries.data.js';
import { type Country } from '@app/countries/application/country.types.js';

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
