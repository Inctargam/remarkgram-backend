import { PaymentsError, PaymentsErrorCode } from '../../../../common/domain/errors/payments.error.js';

export class InvalidPaymentIdError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PAYMENT_ID;

  constructor(id: unknown) {
    super(`Payment id must be a valid UUID: ${String(id)}`);
  }
}

export class InvalidPaymentReferenceError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PAYMENT_REFERENCE;

  constructor(reference: 'userId' | 'planId', value: unknown) {
    super(`Payment ${reference} must be a positive safe integer: ${String(value)}`);
  }
}

export class InvalidPaymentAmountError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PAYMENT_AMOUNT;

  constructor(amount: unknown) {
    super(`Payment amount must be a positive safe integer: ${String(amount)}`);
  }
}

export class InvalidPaymentCurrencyError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PAYMENT_CURRENCY;

  constructor(currency: unknown) {
    super(`Unsupported payment currency: ${String(currency)}`);
  }
}

export class InvalidPaymentPeriodError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PAYMENT_PERIOD;

  constructor(periodUnit: unknown, periodCount: unknown) {
    super(`Invalid payment period combination: ${String(periodUnit)}/${String(periodCount)}`);
  }
}

export class InvalidPaymentProviderIdentityError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PAYMENT_PROVIDER;

  constructor(providerType: unknown, providerId: unknown) {
    super(`Invalid payment provider identity: ${String(providerType)}/${String(providerId)}`);
  }
}

export class InvalidPaymentIdempotentKeyError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PAYMENT_IDEMPOTENT_KEY;

  constructor(idempotentKey: unknown) {
    super(`Payment idempotent key must be a UUID v4: ${String(idempotentKey)}`);
  }
}

export class InvalidPaymentSubscriptionIdError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PAYMENT_SUBSCRIPTION_ID;

  constructor(subscriptionId: unknown) {
    super(`Payment subscription id must be a valid UUID: ${String(subscriptionId)}`);
  }
}

export class InvalidPaymentStateError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PAYMENT_STATE;

  constructor(
    field:
      | 'status'
      | 'createdAt'
      | 'paidAt'
      | 'providerCheckoutId'
      | 'providerPaymentId'
      | 'providerSubscriptionId'
      | 'providerInvoiceId'
      | 'providerCustomerId'
      | 'checkoutExpiresAt'
      | 'period',
    value: unknown,
  ) {
    super(`Invalid payment ${field}: ${String(value)}`);
  }
}
