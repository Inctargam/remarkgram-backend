import { PaymentsError, PaymentsErrorCode } from '../../../../common/domain/errors/payments.error.js';

/** Conditional confirmation matched no row; retry the financial step with a fresh Payment read. */
export class PaymentConfirmationNotAppliedError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_CONFIRMATION_NOT_APPLIED;

  constructor(readonly paymentId: string) {
    super(`Conditional confirmation was not applied to Payment ${paymentId}`);
  }
}
