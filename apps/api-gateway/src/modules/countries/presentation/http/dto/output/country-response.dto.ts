import { type Country } from '@app/countries';
import { ApiProperty } from '@nestjs/swagger';

export class CountryNamesDto {
  @ApiProperty({
    description: 'Country name in English.',
    example: 'United States',
  })
  declare en: string;

  @ApiProperty({
    description: 'Country name in Russian.',
    example: 'США',
  })
  declare ru: string;
}

export class CountryResponseDto {
  @ApiProperty({
    description: 'The ISO 3166-1 alpha-2 country code. Example: US.',
    type: 'string',
    example: 'US',
  })
  readonly code: string;

  @ApiProperty({
    description: 'The localized country names.',
    type: () => CountryNamesDto,
  })
  readonly name: CountryNamesDto;

  constructor(param: Country) {
    this.code = param.code;
    this.name = {
      ru: param.name.ru,
      en: param.name.en,
    };
  }
}
