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
  PAYMENT_ACCESS_DENIED = 'PAYMENT_ACCESS_DENIED',
  PAYMENT_PROVIDER_UNAVAILABLE = 'PAYMENT_PROVIDER_UNAVAILABLE',
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
