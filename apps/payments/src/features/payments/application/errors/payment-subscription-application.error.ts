import { PaymentsError, PaymentsErrorCode } from '../../../../common/domain/errors/payments.error.js';

export type PaymentSubscriptionApplicationConflictReason =
  | 'PAYMENT_STATE_MISMATCH'
  | 'INVALID_HANDLER_RESULT'
  | 'PAYMENT_LINK_CONFLICT'
  | 'PROVIDER_CUSTOMER_MISSING'
  | 'PROVIDER_SUBSCRIPTION_LINK_CONFLICT';

export class PaymentSubscriptionApplicationConflictError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_SUBSCRIPTION_APPLICATION_CONFLICT;

  constructor(
    readonly paymentId: string,
    readonly reason: PaymentSubscriptionApplicationConflictReason,
  ) {
    super(`Successful Payment ${paymentId} cannot be applied to a Subscription: ${reason}`);
  }
}
