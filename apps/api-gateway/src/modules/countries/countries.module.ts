import { Module } from '@nestjs/common';
import { CountriesHttpController } from './presentation/http/controllers/countries-http.controller.js';
import { CountriesReferenceModule } from '@app/countries';

@Module({
  imports: [CountriesReferenceModule],
  controllers: [CountriesHttpController],
})
export class CountriesModule {}
