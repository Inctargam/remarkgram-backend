import { ApiProperty } from '@nestjs/swagger';
import { PAYMENT_STATUS_DESCRIPTION } from './payment-status-description.js';

export class PaymentStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  declare readonly paymentId: string;

  @ApiProperty({
    description: PAYMENT_STATUS_DESCRIPTION,
    example: 'SUCCEEDED',
  })
  declare readonly status: string;

  @ApiProperty({
    description: 'Confirmation time for SUCCEEDED; null for every non-success status.',
    format: 'date-time',
    nullable: true,
    example: '2026-10-19T12:00:00.000Z',
  })
  declare readonly paidAt: string | null;
}
