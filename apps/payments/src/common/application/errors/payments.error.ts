import { PaymentsError, PaymentsErrorCode } from '../../domain/errors/payments.error.js';

export { PaymentsError, PaymentsErrorCode } from '../../domain/errors/payments.error.js';

export class PaymentNotFoundError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_NOT_FOUND;
  constructor(paymentId: string) {
    super(`Payment ${paymentId} was not found`);
  }
}

export class PaymentIdempotencyConflictError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_IDEMPOTENCY_CONFLICT;
  constructor() {
    super('Idempotency-Key was already used with different checkout parameters');
  }
}

export class PaymentInitialReservationConflictError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_INITIAL_RESERVATION_CONFLICT;
  constructor() {
    super('An initial subscription checkout is already in progress');
  }
}

export class PaymentCheckoutReconciliationRequiredError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_CHECKOUT_RECONCILIATION_REQUIRED;
  constructor() {
    super('Checkout correlation conflicts with an existing provider operation');
  }
}

export class PaymentAccessDeniedError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_ACCESS_DENIED;
  constructor() {
    super('Payment does not belong to the current user');
  }
}

export class PaymentWebhookEnqueueUnavailableError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_WEBHOOK_ENQUEUE_UNAVAILABLE;
  constructor() {
    super('Payment webhook could not be durably accepted');
  }
}

export class PaymentSubscriptionContextError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_SUBSCRIPTION_CONTEXT_FAILED;
  constructor() {
    super('Subscription purchase context is unavailable');
  }
}

export class PaymentPlanUnavailableError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_PLAN_UNAVAILABLE;
  constructor() {
    super('Plan is temporarily unavailable');
  }
}

export class PaymentPersistenceError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_PERSISTENCE_FAILED;
  constructor() {
    super('Payment could not be persisted');
  }
}

export class PaymentInconsistentStateError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_INCONSISTENT_STATE;
  constructor(paymentId: string) {
    super(`Payment ${paymentId} is in an inconsistent checkout state`);
  }
}

