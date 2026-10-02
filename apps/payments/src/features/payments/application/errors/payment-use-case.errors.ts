import { PaymentsError, PaymentsErrorCode } from '../../../../common/application/errors/payments.error.js';

export class PlanNotFoundError extends PaymentsError {
  readonly code = PaymentsErrorCode.PLAN_NOT_FOUND;
  constructor(planId: number) {
    super(`Plan ${planId} was not found`);
  }
}
export class PaymentNotFoundError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_NOT_FOUND;
  constructor(paymentId: string) {
    super(`Payment ${paymentId} was not found`);
  }
}
export class PaymentIdempotencyConflictError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_IDEMPOTENCY_CONFLICT;
  constructor() {
    super('Idempotency-Key was already used with another plan');
  }
}
export class PaymentAccessDeniedError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_ACCESS_DENIED;
  constructor() {
    super('Payment does not belong to the current user');
  }
}
export class PaymentProviderUnavailableError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_PROVIDER_UNAVAILABLE;
  constructor() {
    super('Payment provider is temporarily unavailable');
  }
}
export class InvalidProviderEventError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PROVIDER_EVENT;
  constructor(message = 'Invalid payment provider event') {
    super(message);
  }
}
