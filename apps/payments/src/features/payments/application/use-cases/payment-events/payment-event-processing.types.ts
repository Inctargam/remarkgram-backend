export type PaymentReconciliationConflict =
  | 'PURPOSE_MISMATCH'
  | 'PROVIDER_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'CUSTOMER_MISMATCH'
  | 'REFERENCE_CONFLICT';

export type PaymentEventCorrelationResult =
  | { outcome: 'CORRELATED'; paymentId: string }
  | { outcome: 'UNCORRELATED' };

export type CheckoutReconciliationConflict =
  | Exclude<PaymentReconciliationConflict, 'PURPOSE_MISMATCH'>
  | 'CHECKOUT_MODE_MISMATCH';

export type ApplyCheckoutCompletedResult =
  | { outcome: 'APPLIED' | 'ALREADY_APPLIED' }
  | {
      outcome: 'PAYMENT_NOT_FOUND' | 'PAYMENT_ID_MISSING' | CheckoutReconciliationConflict;
    };

export type ConfirmSuccessfulPaymentResult =
  | { outcome: 'SUCCEEDED' | 'ALREADY_SUCCEEDED' }
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
