import type { Payment } from '../../../domain/payment.entity.js';
import type { PAYMENT_RECONCILIATION_CONFLICT } from './payment-reconciliation.policy.js';
import { type PaymentReconciliationConflict } from './payment-reconciliation.policy.js';

export type PaymentEventCorrelationResult =
  | { outcome: 'CORRELATED'; paymentId: string }
  | { outcome: 'UNCORRELATED' };

export type CheckoutReconciliationConflict = Exclude<
  PaymentReconciliationConflict,
  typeof PAYMENT_RECONCILIATION_CONFLICT.PURPOSE_MISMATCH
>;

export const PAYMENT_ID_MISSING_RESULT = {
  outcome: 'PAYMENT_ID_MISSING',
} as const;

export type ApplyCheckoutCompletedResult =
  | { outcome: 'APPLIED' }
  | {
      outcome: 'PAYMENT_NOT_FOUND' | 'PAYMENT_ID_MISSING' | CheckoutReconciliationConflict;
    };

export type CancelExpiredCheckoutSessionResult =
  | { outcome: 'CANCELED'; paymentId: string }
  | {
      outcome: 'PAYMENT_NOT_FOUND' | 'INVALID_TRANSITION' | CheckoutReconciliationConflict;
    };

export type ConfirmSuccessfulPaymentResult =
  | { outcome: 'SUCCEEDED'; payment: Payment }
  | {
      outcome:
        | 'PAYMENT_NOT_FOUND'
        | 'PAYMENT_ID_MISSING'
        | 'SUBSCRIPTION_REFERENCE_MISSING'
        | 'SUBSCRIPTION_ID_MISSING'
        | 'UNSUPPORTED_BILLING_REASON'
        | 'INVALID_TRANSITION'
        | PaymentReconciliationConflict;
    };
