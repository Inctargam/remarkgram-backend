import { ApiProperty } from '@nestjs/swagger';
import { PAYMENT_STATUS_DESCRIPTION } from './payment-status-description.js';

export class CreateCheckoutResponseDto {
  @ApiProperty({ format: 'uuid' })
  declare readonly paymentId: string;

  @ApiProperty({
    description: 'Provider checkout URL, or null when the existing payment no longer requires checkout.',
    example: 'https://checkout.stripe.com/c/pay/cs_test_example',
    nullable: true,
  })
  declare readonly checkoutUrl: string | null;

  @ApiProperty({
    description: PAYMENT_STATUS_DESCRIPTION,
    example: 'PENDING',
  })
  declare readonly status: string;
}
