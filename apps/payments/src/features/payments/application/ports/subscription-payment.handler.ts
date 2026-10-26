import type { SuccessfulPayment } from '../types/successful-payment.types.js';
import type { PaymentsTransactionContext } from './payments-unit-of-work.js';

export type ApplySuccessfulPaymentAction = 'CREATED' | 'SCHEDULED' | 'RENEWED';

export type ApplySuccessfulPaymentResult = {
  subscriptionId: string;
  action: ApplySuccessfulPaymentAction;
  /**
   * D2-owned start of the next provider-managed billing period. For SCHEDULED,
   * this is when the first automatic charge may occur after all already paid
   * local periods, including the period granted by this Payment, have ended.
   * Serialized as canonical UTC ISO-8601.
   */
  nextSubscriptionStartsAt: string;
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
  /**
   * Makes the previous provider Subscription a terminal retiring link in D2.
   * After commit it remains active only until its paid period ends and must no
   * longer be eligible for auto-renewal enable/disable commands.
   */
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
