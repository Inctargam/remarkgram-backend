import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const MAX_SIGNED_INT_32 = 2_147_483_647;

export class CreateCheckoutDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: MAX_SIGNED_INT_32 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SIGNED_INT_32)
  declare readonly planId: number;

  @ApiProperty({ enum: ['STRIPE'], example: 'STRIPE' })
  @IsIn(['STRIPE'])
  declare readonly provider: string;
}
