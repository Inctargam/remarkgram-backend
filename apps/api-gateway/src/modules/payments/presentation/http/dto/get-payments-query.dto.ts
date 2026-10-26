import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const MAX_PAYMENTS_PAGE_SIZE = 100;
const MAX_SIGNED_INT_32 = 2_147_483_647;
export const MAX_PAYMENTS_PAGE_NUMBER = Math.floor(MAX_SIGNED_INT_32 / MAX_PAYMENTS_PAGE_SIZE) + 1;

export class GetPaymentsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MAX_PAYMENTS_PAGE_NUMBER })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAYMENTS_PAGE_NUMBER)
  declare readonly pageNumber: number;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: MAX_PAYMENTS_PAGE_SIZE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAYMENTS_PAGE_SIZE)
  declare readonly pageSize: number;

  constructor() {
    this.pageNumber = 1;
    this.pageSize = 10;
  }
}
