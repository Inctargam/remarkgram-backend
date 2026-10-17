import { PaymentsError, PaymentsErrorCode } from '../../../../common/domain/errors/payments.error.js';

export class PaymentProviderUnavailableError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_PROVIDER_UNAVAILABLE;
  constructor() {
    super('Payment provider is temporarily unavailable');
  }
}

export class PaymentProviderValidationError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_PROVIDER_VALIDATION_FAILED;
  constructor() {
    super('Payment provider rejected the operation request');
  }
}

export class PaymentProviderOutcomeUnknownError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_PROVIDER_OUTCOME_UNKNOWN;
  constructor() {
    super('Payment provider outcome is unknown; retry with the same idempotency key');
  }
}

export class PaymentProviderResultMismatchError extends PaymentsError {
  readonly code = PaymentsErrorCode.PAYMENT_PROVIDER_RESULT_MISMATCH;
  constructor(operation: string) {
    super(`Payment provider returned an inconsistent result for ${operation}`);
  }
}

