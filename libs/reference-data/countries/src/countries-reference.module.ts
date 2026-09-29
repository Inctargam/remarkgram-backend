import { Module } from '@nestjs/common';
import { CountriesApi } from './application/contries-api.js';
import { CountriesService } from './internal/countries.service.js';
import { CountryCatalog } from './internal/country-catalog.js';

@Module({
  providers: [
    CountryCatalog,
    {
      provide: CountriesApi,
      useClass: CountriesService,
    },
  ],
  exports: [CountriesApi],
})
export class CountriesReferenceModule {}
