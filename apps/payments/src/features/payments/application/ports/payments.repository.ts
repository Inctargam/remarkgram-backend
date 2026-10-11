import type { Payment, PaymentStatus } from '../../domain/payment.entity.js';
import type { ProviderCheckout, VerifiedProviderEvent } from './payment-provider.js';

export type WebhookProcessingResult = 'PROCESSED' | 'DUPLICATE' | 'IGNORED';

export type CreatePaymentResult =
  | { outcome: 'CREATED'; payment: Payment }
  | { outcome: 'IDEMPOTENCY_CONFLICT'; payment: Payment }
  | { outcome: 'INITIAL_RESERVATION_CONFLICT'; payment: Payment };

export type AttachCheckoutResult =
  | { outcome: 'ATTACHED' | 'ALREADY_ATTACHED'; payment: Payment }
  | { outcome: 'PAYMENT_NOT_FOUND' | 'INVALID_STATE' | 'CHECKOUT_CONFLICT' }
  | {
      outcome: 'PROVIDER_REFERENCE_CONFLICT';
      reference: 'CHECKOUT' | 'PAYMENT' | 'SUBSCRIPTION' | 'INVOICE' | 'UNKNOWN';
    };

export abstract class PaymentsRepository {
  abstract create(payment: Payment): Promise<CreatePaymentResult>;
  abstract findByUserAndIdempotency(userId: number, idempotencyKey: string): Promise<Payment | null>;
  abstract findById(paymentId: string): Promise<Payment | null>;
  abstract attachCheckout(paymentId: string, checkout: ProviderCheckout): Promise<AttachCheckoutResult>;
  abstract markStatus(paymentId: string, status: PaymentStatus): Promise<void>;
  abstract processProviderEvent(event: VerifiedProviderEvent): Promise<WebhookProcessingResult>;
}
