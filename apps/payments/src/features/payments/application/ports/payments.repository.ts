import type { Payment, PaymentStatus } from '../../domain/payment.entity.js';
import type { ProviderCheckout, VerifiedProviderEvent } from './payment-provider.js';

export type WebhookProcessingResult = 'PROCESSED' | 'DUPLICATE' | 'IGNORED';
export abstract class PaymentsRepository {
  abstract create(payment: Payment): Promise<Payment>;
  abstract findByUserAndIdempotency(userId: number, idempotencyKey: string): Promise<Payment | null>;
  abstract findById(paymentId: string): Promise<Payment | null>;
  abstract attachCheckout(paymentId: string, checkout: ProviderCheckout): Promise<Payment>;
  abstract markStatus(paymentId: string, status: PaymentStatus): Promise<void>;
  abstract processProviderEvent(event: VerifiedProviderEvent): Promise<WebhookProcessingResult>;
}
