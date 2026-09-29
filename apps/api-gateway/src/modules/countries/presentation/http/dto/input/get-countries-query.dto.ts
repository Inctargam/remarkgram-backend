import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class GetCountriesQueryDto {
  @ApiProperty({
    name: 'Search by term',
    required: false,
    example: 'US, USA, США, United States, united',
    description:
      'Use this "term" to search for a country. The search includes standard Alpha-2 or Alpha-3 codes, as well as country names.\n' +
      'If you leave the “term” field blank, a list of countries will be displayed. The search is not case-sensitive.',
  })
  @IsOptional()
  declare term: string;

  @ApiProperty({
    name: 'Limit',
    required: false,
    description: 'Limitation: the list of countries in the results. Default: 20',
  })
  @IsOptional()
  declare limit: number;
}
