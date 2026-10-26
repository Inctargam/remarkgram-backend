import { ApiProperty } from '@nestjs/swagger';
import { PAYMENT_STATUS_DESCRIPTION } from './payment-status-description.js';

export class PaymentListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  declare readonly paymentId: string;
  @ApiProperty({ example: 1 })
  declare readonly planId: number;
  @ApiProperty({ description: 'Amount in the currency minor unit.', example: 999 })
  declare readonly amount: number;
  @ApiProperty({ example: 'USD' })
  declare readonly currency: string;
  @ApiProperty({ example: 1 })
  declare readonly periodCount: number;
  @ApiProperty({ example: 'MONTH' })
  declare readonly periodUnit: string;
  @ApiProperty({ example: 'STRIPE' })
  declare readonly provider: string;
  @ApiProperty({ example: 'PURCHASE' })
  declare readonly type: string;
  @ApiProperty({
    description: PAYMENT_STATUS_DESCRIPTION,
    example: 'SUCCEEDED',
  })
  declare readonly status: string;
  @ApiProperty({ format: 'date-time' })
  declare readonly createdAt: string;
  @ApiProperty({
    description: 'Confirmation time for SUCCEEDED; null for every non-success status.',
    format: 'date-time',
    nullable: true,
  })
  declare readonly paidAt: string | null;
}
