import type { Currency, PeriodUnit } from '../../../plans/domain/plan.entity.js';
import type { CheckoutPurpose } from '../../domain/payment.entity.js';

export type CreateProviderCheckoutInput = {
  paymentId: string;
  amount: number;
  currency: Currency;
  periodCount: number;
  periodUnit: PeriodUnit;
  idempotencyKey: string;
  customerId: string;
  checkoutPurpose: CheckoutPurpose;
};
export type ProviderOperationFailure =
  | { outcome: 'VALIDATION_ERROR' }
  | { outcome: 'UNAVAILABLE' }
  | { outcome: 'UNKNOWN' };
export type ProviderCheckout = {
  checkoutId: string;
  checkoutUrl: string;
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
  providerInvoiceId: string | null;
  providerCustomerId: string;
  checkoutExpiresAt: Date;
  snapshot: Record<string, unknown>;
};
export type CreateProviderCheckoutResult =
  | { outcome: 'CREATED'; checkout: ProviderCheckout }
  | ProviderOperationFailure;
export type VerifiedProviderEvent = {
  eventId: string;
  eventType: string;
  providerCreatedAt: Date | null;
  internalPaymentId: string | null;
  customerId: string | null;
  checkoutId: string | null;
  // Stripe SDK допускает появление новых строковых значений раньше обновления нашего контракта.
  // Неизвестные значения сохраняются для аудита и не должны подтверждать платеж автоматически.
  checkoutMode: string | null;
  paymentStatus: string | null;
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
  providerInvoiceId: string | null;
  amount: number | null;
  currency: string | null;
  outcome: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'IGNORED';
  snapshot: Record<string, unknown>;
};

export type CreatePaymentCustomerProps = {
  internalUserId: string;
};
export type CreatePaymentCustomerResult = Promise<
  { outcome: 'CREATED'; providerCustomerId: string } | ProviderOperationFailure
>;
export abstract class PaymentProviderPort {
  abstract createCheckout(input: CreateProviderCheckoutInput): Promise<CreateProviderCheckoutResult>;
  abstract verifyWebhook(rawBody: Buffer, signature: string): VerifiedProviderEvent;
  abstract createCustomer(props: CreatePaymentCustomerProps): CreatePaymentCustomerResult;
}
