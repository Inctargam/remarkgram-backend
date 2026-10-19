import type { Country, SearchCountriesOptions } from '@app/countries/application/country.types.js';

export abstract class CountriesApi {
  abstract findByCode(code: string): Promise<Country | null>;

  abstract exists(code: string): Promise<boolean>;

  abstract getCountries(options: SearchCountriesOptions): Promise<readonly Country[]>;
}
