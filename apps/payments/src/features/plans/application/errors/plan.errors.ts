import { PaymentsError, PaymentsErrorCode } from '../../../../common/application/errors/payments.error.js';

export class InvalidPlanIdError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PLAN_ID;

  constructor(id: unknown) {
    super(`Plan id must be a positive safe integer: ${String(id)}`);
  }
}

export class InvalidPlanPriceError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PLAN_PRICE;

  constructor(price: unknown) {
    super(`Plan price must be a non-empty number represented as a positive safe integer: ${String(price)}`);
  }
}

export class InvalidPlanCurrencyError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PLAN_CURRENCY;

  constructor(currency: unknown) {
    super(`Unsupported plan currency: ${String(currency)}`);
  }
}

export class InvalidPlanPeriodError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PLAN_PERIOD;

  constructor(periodUnit: unknown, periodCount: number) {
    super(`Invalid plan period combination: ${String(periodUnit)}/${periodCount}`);
  }
}
