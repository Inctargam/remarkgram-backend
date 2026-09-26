import { Controller, Get, Query } from '@nestjs/common';
import { CountriesApi, type Country } from '@app/countries';
import { GetCountriesQueryDto } from '../dto/input/get-countries-query.dto.js';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CountryResponseDto } from '../dto/output/country-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../common/http/validation-error-response.dto.js';

@ApiTags('Countries')
@Controller('countries')
export class CountriesHttpController {
  constructor(private readonly countriesApi: CountriesApi) {}

  @Get('')
  @ApiOperation({
    summary: 'Get list of countries',
  })
  @ApiOkResponse({
    description: 'List of Countries',
    isArray: true,
    type: CountryResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The query parameter is invalid.', type: ValidationErrorResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized invalid credentials.',
  })
  async getCountries(@Query() query: GetCountriesQueryDto): Promise<CountryResponseDto[]> {
    const countries = await this.countriesApi.getCountries(query);

    return countries.map((country: Country) => new CountryResponseDto(country));
  }
}
