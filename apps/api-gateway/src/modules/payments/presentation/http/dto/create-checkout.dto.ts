import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, Min } from 'class-validator';

export class CreateCheckoutDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare readonly planId: number;

  @IsIn(['STRIPE'])
  declare readonly provider: string;

  @IsBoolean()
  declare readonly autoRenewal: boolean;
}
