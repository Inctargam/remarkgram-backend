import type {
  Payment,
  PaymentProvider,
  PaymentStatus,
} from '../../domain/payment.entity.js';
import type { ProviderCheckout } from './payment-provider.js';
import type { PaymentsTransactionContext } from './payments-unit-of-work.js';

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

type ApplyCheckoutCompletedCommandBase = {
  paymentId: string;
  providerCheckoutId: string;
  providerCustomerId?: string | null;
};

export type ApplyCheckoutCompletedCommand = ApplyCheckoutCompletedCommandBase &
  (
    | { providerPaymentId: string | null; providerSubscriptionId?: never }
    | { providerPaymentId?: never; providerSubscriptionId: string | null }
  );

export type ApplyCheckoutCompletedUpdateResult =
  | { outcome: 'APPLIED' }
  | { outcome: 'REFERENCE_CONFLICT' };

export type ConfirmSuccessfulPaymentCommand = {
  paymentId: string;
  paidAt: Date;
  providerPaymentId?: string | null;
  providerSubscriptionId?: string | null;
  providerInvoiceId?: string | null;
  providerCustomerId?: string | null;
};

export type ConfirmSuccessfulPaymentUpdateResult =
  | { outcome: 'SUCCEEDED'; payment: Payment }
  | { outcome: 'INVALID_TRANSITION' | 'REFERENCE_CONFLICT' };

export type LinkPaymentSubscriptionCommand = {
  paymentId: string;
  subscriptionId: string;
};

export type LinkPaymentSubscriptionResult = { outcome: 'LINKED' | 'NOT_LINKED' };

export type BindPaymentProviderSubscriptionCommand = {
  paymentId: string;
  subscriptionId: string;
  providerSubscriptionId: string;
};

export type BindPaymentProviderSubscriptionResult = { outcome: 'BOUND' | 'NOT_BOUND' };

export type CancelPendingPaymentCommand = {
  paymentId: string;
  providerCheckoutId: string;
  providerCustomerId?: string | null;
};

export type CancelPendingPaymentUpdateResult =
  | { outcome: 'CANCELED' }
  | { outcome: 'INVALID_TRANSITION' | 'REFERENCE_CONFLICT' };

export type CreateSuccessfulRenewalCommand = {
  userId: number;
  planId: number;
  amount: number;
  currency: Payment['currency'];
  periodCount: number;
  periodUnit: Payment['periodUnit'];
  providerType: PaymentProvider;
  providerPaymentId: string | null;
  providerSubscriptionId: string;
  providerInvoiceId: string;
  providerCustomerId: string | null;
  subscriptionId: string;
  paidAt: Date;
};

export type CreateSuccessfulRenewalResult = {
  outcome: 'PERSISTED';
  payment: Payment;
} | { outcome: 'REFERENCE_CONFLICT' };

export abstract class PaymentsRepository {
  abstract create(payment: Payment): Promise<CreatePaymentResult>;
  abstract findByUserAndIdempotency(userId: number, idempotencyKey: string): Promise<Payment | null>;
  abstract findById(paymentId: string, ctx?: PaymentsTransactionContext): Promise<Payment | null>;
  abstract findByProviderPaymentId(
    provider: PaymentProvider,
    providerPaymentId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null>;
  abstract findByProviderCheckoutId(
    provider: PaymentProvider,
    providerCheckoutId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null>;
  abstract findByProviderInvoiceId(
    provider: PaymentProvider,
    providerInvoiceId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null>;
  abstract findByProviderSubscriptionId(
    provider: PaymentProvider,
    providerSubscriptionId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null>;
  abstract attachCheckout(paymentId: string, checkout: ProviderCheckout): Promise<AttachCheckoutResult>;
  abstract applyCheckoutCompleted(
    command: ApplyCheckoutCompletedCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<ApplyCheckoutCompletedUpdateResult>;
  abstract confirmSuccessfulPayment(
    command: ConfirmSuccessfulPaymentCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<ConfirmSuccessfulPaymentUpdateResult>;
  abstract linkSuccessfulPaymentToSubscription(
    command: LinkPaymentSubscriptionCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<LinkPaymentSubscriptionResult>;
  abstract bindPaymentProviderSubscription(
    command: BindPaymentProviderSubscriptionCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<BindPaymentProviderSubscriptionResult>;
  abstract cancelPendingPayment(
    command: CancelPendingPaymentCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<CancelPendingPaymentUpdateResult>;
  abstract createSuccessfulRenewal(
    command: CreateSuccessfulRenewalCommand,
    ctx: PaymentsTransactionContext,
  ): Promise<CreateSuccessfulRenewalResult>;
  abstract markStatus(paymentId: string, status: PaymentStatus): Promise<void>;
}
