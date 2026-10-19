import { ApiProperty } from '@nestjs/swagger';

export class PlanResponseDto {
  @ApiProperty({ example: 1 })
  declare readonly id: number;

  @ApiProperty({ description: 'Price in the currency minor unit.', example: 999 })
  declare readonly price: number;

  @ApiProperty({ example: 'USD' })
  declare readonly currency: string;

  @ApiProperty({ example: 1 })
  declare readonly periodCount: number;

  @ApiProperty({ example: 'MONTH' })
  declare readonly periodUnit: string;
}
