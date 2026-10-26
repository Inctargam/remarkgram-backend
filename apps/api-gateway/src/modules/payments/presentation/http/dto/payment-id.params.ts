import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class PaymentIdParams {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  declare readonly paymentId: string;
}
