import { Injectable } from '@nestjs/common';
import { CountriesApi } from '../application/contries-api.js';
import { type SearchCountriesOptions } from '../application/country.types.js';
import { CountryCatalog } from '../internal/country-catalog.js';
import { CountryMapper } from '../internal/mapper/country-view.mapper.js';
import { CountryRecord } from '../internal/countries.data.js';

@Injectable()
export class CountriesService implements CountriesApi {
  constructor(private readonly catalog: CountryCatalog) {}

  async findByCode(code: string) {
    const record = this.catalog.findByCode(code);
    if (!record) {
      return null;
    }
    return Promise.resolve(CountryMapper.toView(record));
  }
  async exists(code: string) {
    return Promise.resolve(this.catalog.exists(code));
  }
  async getCountries(options: SearchCountriesOptions) {
    const { term = undefined, limit = 20 } = options;
    let records: CountryRecord[] = [];
    const normalizeTerm = (term ?? '').trim();

    //term отсутствует или пустой — вернуть список стран;
    if (!normalizeTerm || !normalizeTerm.length) {
      records = this.catalog.list({ limit: limit });
    }
    // term передан — вернуть результаты поиска;
    if (normalizeTerm.length > 1) {
      records = this.catalog.search(normalizeTerm, { limit: limit });
    }

    return Promise.resolve(records.map((record) => CountryMapper.toView(record)));
  }
}
