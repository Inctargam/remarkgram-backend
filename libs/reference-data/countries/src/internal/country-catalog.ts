import { COUNTRIES, type CountryRecord } from './countries.data.js';
import { normalizeSearchText } from './normalize-country-search.js';
import { Injectable, Logger } from '@nestjs/common';

type SearchEntry = {
  normalizedTerm: string;
  country: CountryRecord;
};
type SearchCountriesOptions = {
  limit?: number;
};
type ListCountriesOptions = {
  limit?: number;
};
@Injectable()
export class CountryCatalog {
  private readonly logger = new Logger('CountryCatalog');
  private readonly byAlpha2 = new Map<string, CountryRecord>();
  private readonly byAlpha3 = new Map<string, CountryRecord>();
  private readonly searchEntries: SearchEntry[] = [];
  private readonly MAX_LIMIT = 100;
  private readonly LIMIT = 20;

  constructor() {
    for (const country of COUNTRIES) {
      this.byAlpha2.set(country.alpha2.toUpperCase(), country);
      this.byAlpha3.set(country.alpha3.toUpperCase(), country);

      const terms = [
        country.alpha2,
        country.alpha3,
        ...Object.values(country.names),
        ...(country.aliases ?? []),
      ].join('|');

      this.searchEntries.push({
        normalizedTerm: normalizeSearchText(terms),
        country: country,
      });
    }
  }
  private isPositiveInteger(num: any) {
    return typeof num === 'number' && Number.isInteger(num) && num > 0;
  }

  findByCode(code: string): CountryRecord | null {
    const normalizedCode = code.trim().toUpperCase();
    return this.byAlpha2.get(normalizedCode) ?? this.byAlpha3.get(normalizedCode) ?? null;
  }

  exists(code: string): boolean {
    return !!this.findByCode(code);
  }
  list(options: ListCountriesOptions): CountryRecord[] {
    const perLimit = this.isPositiveInteger(Number(options.limit)) ? Number(options.limit) : this.LIMIT;
    const limit = perLimit > this.MAX_LIMIT ? this.MAX_LIMIT : Number(perLimit);

    return COUNTRIES.slice(limit);
  }
  search(term: string, options: SearchCountriesOptions): CountryRecord[] {
    const regex = /^[A-Za-zА-Яа-яЁё]+$/;
    if (typeof term !== 'string') {
      throw new TypeError('Search term must be a string.');
    }
    if (!regex.test(term)) {
      throw new Error(
        `Search term "${term}" must contain only Latin (A-Z, a-z) or Cyrillic (А-Я, а-я, Ё, ё) letters.`,
      );
    }
    const matches = new Map<string, CountryRecord>();
    const searchTerm = normalizeSearchText(term ?? '');
    const perLimit = this.isPositiveInteger(Number(options.limit)) ? Number(options.limit) : this.LIMIT;
    const limit = perLimit > this.MAX_LIMIT ? this.MAX_LIMIT : Number(perLimit);
    if (!searchTerm) {
      return [];
    }
    for (const entry of this.searchEntries) {
      const { normalizedTerm: normalizedTerm, country } = entry;
      if (matches.size >= limit) {
        break;
      }
      if (this.byAlpha2.has(searchTerm) || this.byAlpha3.has(searchTerm)) {
        matches.set(country.alpha2, country);
        continue;
      }
      if (normalizedTerm.includes(searchTerm)) {
        matches.set(country.alpha2, country);
      }
    }
    const records = [...matches] as unknown as CountryRecord[];
    console.dir(records);
    return records;
  }
}
