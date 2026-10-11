export enum PaymentsErrorCode {
  INVALID_PAYMENT_METHOD = 'INVALID_PAYMENT_METHOD',
  INVALID_PLAN_ID = 'INVALID_PLAN_ID',
  INVALID_PLAN_PRICE = 'INVALID_PLAN_PRICE',
  INVALID_PLAN_CURRENCY = 'INVALID_PLAN_CURRENCY',
  INVALID_PLAN_PERIOD = 'INVALID_PLAN_PERIOD',
  INVALID_PAYMENT_ID = 'INVALID_PAYMENT_ID',
  INVALID_PAYMENT_REFERENCE = 'INVALID_PAYMENT_REFERENCE',
  INVALID_PAYMENT_AMOUNT = 'INVALID_PAYMENT_AMOUNT',
  INVALID_PAYMENT_CURRENCY = 'INVALID_PAYMENT_CURRENCY',
  INVALID_PAYMENT_PERIOD = 'INVALID_PAYMENT_PERIOD',
  INVALID_PAYMENT_PROVIDER = 'INVALID_PAYMENT_PROVIDER',
  INVALID_PAYMENT_IDEMPOTENT_KEY = 'INVALID_PAYMENT_IDEMPOTENT_KEY',
  INVALID_PAYMENT_SUBSCRIPTION_ID = 'INVALID_PAYMENT_SUBSCRIPTION_ID',
  INVALID_PAYMENT_STATE = 'INVALID_PAYMENT_STATE',
  PLAN_NOT_FOUND = 'PLAN_NOT_FOUND',
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  PAYMENT_IDEMPOTENCY_CONFLICT = 'PAYMENT_IDEMPOTENCY_CONFLICT',
  PAYMENT_INITIAL_RESERVATION_CONFLICT = 'PAYMENT_INITIAL_RESERVATION_CONFLICT',
  PAYMENT_CHECKOUT_RECONCILIATION_REQUIRED = 'PAYMENT_CHECKOUT_RECONCILIATION_REQUIRED',
  PAYMENT_ACCESS_DENIED = 'PAYMENT_ACCESS_DENIED',
  PAYMENT_PROVIDER_UNAVAILABLE = 'PAYMENT_PROVIDER_UNAVAILABLE',
  PAYMENT_PROVIDER_VALIDATION_FAILED = 'PAYMENT_PROVIDER_VALIDATION_FAILED',
  PAYMENT_PROVIDER_OUTCOME_UNKNOWN = 'PAYMENT_PROVIDER_OUTCOME_UNKNOWN',
  PAYMENT_CUSTOMER_PROVIDER_FAILED = 'PAYMENT_CUSTOMER_PROVIDER_FAILED',
  PAYMENT_SUBSCRIPTION_CONTEXT_FAILED = 'PAYMENT_SUBSCRIPTION_CONTEXT_FAILED',
  PAYMENT_PLAN_UNAVAILABLE = 'PAYMENT_PLAN_UNAVAILABLE',
  PAYMENT_PERSISTENCE_FAILED = 'PAYMENT_PERSISTENCE_FAILED',
  PAYMENT_INCONSISTENT_STATE = 'PAYMENT_INCONSISTENT_STATE',
  INVALID_PROVIDER_EVENT = 'INVALID_PROVIDER_EVENT',
}

export abstract class PaymentsError extends Error {
  abstract readonly code: PaymentsErrorCode;
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
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

export class PaymentProviderUnavailableError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_PROVIDER_UNAVAILABLE;
  constructor() {
    super('Payment provider is temporarily unavailable');
  }
}

export class PaymentProviderValidationError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_PROVIDER_VALIDATION_FAILED;
  constructor() {
    super('Payment provider rejected the checkout request');
  }
}

export class PaymentProviderOutcomeUnknownError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_PROVIDER_OUTCOME_UNKNOWN;
  constructor() {
    super('Payment provider outcome is unknown; retry with the same idempotency key');
  }
}

export class PaymentCustomerProviderError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_CUSTOMER_PROVIDER_FAILED;
  constructor() {
    super('Payment customer could not be created');
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

export class InvalidProviderEventError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PROVIDER_EVENT;
  constructor(message = 'Invalid payment provider event') {
    super(message);
  }
}
