import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CountriesService } from './countries.service.js';
import type { CountryCatalog } from './country-catalog.js';
import type { CountryRecord } from './countries.data.js';

describe(CountriesService.name, () => {
  const ukraine: CountryRecord = {
    alpha2: 'UA',
    alpha3: 'UKR',
    names: { en: 'Ukraine', ru: 'Украина' },
    aliases: ['Україна'],
  };
  const poland: CountryRecord = {
    alpha2: 'PL',
    alpha3: 'POL',
    names: { en: 'Poland', ru: 'Польша' },
  };

  let catalog: {
    findByCode: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  };
  let service: CountriesService;

  beforeEach(() => {
    catalog = {
      findByCode: vi.fn(),
      exists: vi.fn(),
      list: vi.fn(),
      search: vi.fn(),
    };
    service = new CountriesService(catalog as unknown as CountryCatalog);
  });

  describe('findByCode', () => {
    it('maps a catalog record to the public country view', async () => {
      catalog.findByCode.mockReturnValue(ukraine);

      await expect(service.findByCode('ua')).resolves.toEqual({
        code: 'UA',
        name: { en: 'Ukraine', ru: 'Украина' },
      });
      expect(catalog.findByCode).toHaveBeenCalledOnce();
      expect(catalog.findByCode).toHaveBeenCalledWith('ua');
    });

    it('returns null when the catalog has no matching country', async () => {
      catalog.findByCode.mockReturnValue(null);

      await expect(service.findByCode('ZZ')).resolves.toBeNull();
    });
  });

  describe('exists', () => {
    it('delegates the code check to the catalog', async () => {
      catalog.exists.mockReturnValue(true);

      await expect(service.exists('UA')).resolves.toBe(true);
      expect(catalog.exists).toHaveBeenCalledOnce();
      expect(catalog.exists).toHaveBeenCalledWith('UA');
    });
  });

  describe('getCountries', () => {
    it.each([undefined, '', '   '])('lists countries when term is %j', async (term) => {
      catalog.list.mockReturnValue([ukraine, poland]);

      await expect(service.getCountries({ term, limit: 2 })).resolves.toEqual([
        { code: 'UA', name: { en: 'Ukraine', ru: 'Украина' } },
        { code: 'PL', name: { en: 'Poland', ru: 'Польша' } },
      ]);
      expect(catalog.list).toHaveBeenCalledWith({ limit: 2 });
      expect(catalog.search).not.toHaveBeenCalled();
    });

    it('uses the service default limit when it is omitted', async () => {
      catalog.list.mockReturnValue([]);

      await service.getCountries({});

      expect(catalog.list).toHaveBeenCalledWith({ limit: 20 });
    });

    it('trims the term and delegates searching to the catalog', async () => {
      catalog.search.mockReturnValue([ukraine]);

      await expect(service.getCountries({ term: '  ukraine  ', limit: 5 })).resolves.toEqual([
        { code: 'UA', name: { en: 'Ukraine', ru: 'Украина' } },
      ]);
      expect(catalog.search).toHaveBeenCalledWith('ukraine', { limit: 5 });
      expect(catalog.list).not.toHaveBeenCalled();
    });

    it('propagates catalog errors as rejected promises', async () => {
      catalog.search.mockImplementation(() => {
        throw new Error('catalog failed');
      });

      await expect(service.getCountries({ term: 'Ukraine' })).rejects.toThrow('catalog failed');
    });
  });
});
