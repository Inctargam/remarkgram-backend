import { Injectable } from '@nestjs/common';
import { CountriesApi } from '../application/contries-api.js';
import { type SearchCountriesOptions } from '../application/country.types.js';
import { CountryCatalog } from './country-catalog.js';
import { CountryMapper } from './mappers/country-view.mapper.js';
import { CountryRecord } from './countries.data.js';

@Injectable()
export class CountriesService implements CountriesApi {
  constructor(private readonly catalog: CountryCatalog) {}

  async findByCode(code: string) {
    const record = await Promise.resolve().then(() => this.catalog.findByCode(code));
    if (!record) {
      return null;
    }
    return CountryMapper.toView(record);
  }
  async exists(code: string) {
    return Promise.resolve().then(() => this.catalog.exists(code));
  }
  async getCountries(options: SearchCountriesOptions) {
    const { term = undefined, limit = 20 } = options;
    let records: CountryRecord[] = [];
    const normalizeTerm = (term ?? '').trim();

    //term отсутствует или пустой — вернуть список стран;
    if (!normalizeTerm || !normalizeTerm.length) {
      records = await Promise.resolve().then(() => this.catalog.list({ limit: limit }));
    }
    // term передан — вернуть результаты поиска;
    if (normalizeTerm.length > 0) {
      records = await Promise.resolve().then(() => this.catalog.search(normalizeTerm, { limit: limit }));
    }

    return records.map((record) => CountryMapper.toView(record));
  }
}
