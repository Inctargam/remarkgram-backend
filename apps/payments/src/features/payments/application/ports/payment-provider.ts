import type { Currency } from '../../../../common/domain/currency.enum.js';
import type { PeriodUnit } from '../../../../common/domain/period-unit.enum.js';
import type { CheckoutPurpose, PaymentProvider } from '../../domain/payment.entity.js';

export type CreateProviderCheckoutInput = {
  paymentId: string;
  amount: number;
  currency: Currency;
  periodCount: number;
  periodUnit: PeriodUnit;
  operationId: string;
  customerId: string;
  checkoutPurpose: CheckoutPurpose;
};
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
export type CreateProviderCheckoutResult = { checkout: ProviderCheckout };
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
export type CreatePaymentCustomerResult = Promise<{ providerCustomerId: string }>;
export type ScheduleProviderSubscriptionCancellationResult = {
  providerSubscriptionId: string;
  cancelAtPeriodEnd: true;
};
export type CreateDeferredProviderSubscriptionInput = {
  paymentId: string;
  subscriptionId: string;
  customerId: string;
  amount: number;
  currency: Currency;
  periodCount: number;
  periodUnit: PeriodUnit;
  billingCycleAnchor: string;
  operationId: string;
};
export type CreateDeferredProviderSubscriptionResult = {
  providerSubscriptionId: string;
};
export type SetProviderSubscriptionAutoRenewalInput = {
  providerSubscriptionId: string;
  autoRenewalEnabled: boolean;
  autoRenewalChangeId: string;
};
export type SetProviderSubscriptionAutoRenewalResult = {
  providerSubscriptionId: string;
  autoRenewalEnabled: boolean;
};
export abstract class PaymentProviderPort {
  abstract createCheckout(input: CreateProviderCheckoutInput): Promise<CreateProviderCheckoutResult>;
  abstract verifyWebhook(rawBody: Buffer, signature: string): VerifiedProviderWebhook;
  abstract createCustomer(props: CreatePaymentCustomerProps): CreatePaymentCustomerResult;
  abstract scheduleSubscriptionCancellation(
    providerSubscriptionId: string,
  ): Promise<ScheduleProviderSubscriptionCancellationResult>;
  abstract createDeferredSubscription(
    input: CreateDeferredProviderSubscriptionInput,
  ): Promise<CreateDeferredProviderSubscriptionResult>;
  abstract setSubscriptionAutoRenewal(
    input: SetProviderSubscriptionAutoRenewalInput,
  ): Promise<SetProviderSubscriptionAutoRenewalResult>;
}
