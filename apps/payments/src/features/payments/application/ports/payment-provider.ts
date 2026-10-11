import type { Currency, PeriodUnit } from '../../../plans/domain/plan.entity.js';
import type { CheckoutPurpose, PaymentProvider } from '../../domain/payment.entity.js';

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
export type VerifiedProviderWebhook = {
  provider: PaymentProvider;
  id: string;
  type: string;
  createdAt: Date;
  payload: unknown;
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
  abstract verifyWebhook(rawBody: Buffer, signature: string): VerifiedProviderWebhook;
  abstract createCustomer(props: CreatePaymentCustomerProps): CreatePaymentCustomerResult;
}
