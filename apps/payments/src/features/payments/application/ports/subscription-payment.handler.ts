import type { SuccessfulPayment } from '../types/successful-payment.types.js';
import type { PaymentsTransactionContext } from './payments-unit-of-work.js';

export type ApplySuccessfulPaymentAction = 'CREATED' | 'SCHEDULED' | 'RENEWED';

export type ApplySuccessfulPaymentResult = {
  subscriptionId: string;
  action: ApplySuccessfulPaymentAction;
  /** End of the locally granted access period, serialized for durable workflow transport. */
  paidUntil: string;
  /** Provider subscription being replaced; required when action is SCHEDULED. */
  previousProviderSubscriptionId: string | null;
};

/**
 * D1 -> D2 application boundary.
 *
 * The D2 implementation owns Subscription lifecycle and period calculation.
 * It must apply a Payment idempotently by paymentId and use the supplied local
 * transaction so D2 changes can be committed with the D1 Payment binding.
 */
export abstract class SubscriptionPaymentHandler {
  abstract applySuccessfulPayment(
    payment: SuccessfulPayment,
    tx: PaymentsTransactionContext,
  ): Promise<ApplySuccessfulPaymentResult>;
  abstract markProviderSubscriptionCancellationScheduled(
    subscriptionId: string,
    providerSubscriptionId: string,
    tx: PaymentsTransactionContext,
  ): Promise<void>;
  abstract bindProviderSubscription(
    paymentId: string,
    subscriptionId: string,
    providerSubscriptionId: string,
    tx: PaymentsTransactionContext,
  ): Promise<void>;
}
