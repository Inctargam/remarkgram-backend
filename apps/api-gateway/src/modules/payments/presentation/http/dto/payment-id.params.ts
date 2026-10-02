import { IsUUID } from 'class-validator';
export class PaymentIdParams {
  @IsUUID() declare readonly paymentId: string;
}
