import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreateCheckoutDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare readonly planId: number;
}
