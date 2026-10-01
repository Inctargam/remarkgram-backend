export enum PaymentsErrorCode {
  INVALID_PAYMENT_METHOD = 'INVALID_PAYMENT_METHOD',
  INVALID_PLAN_ID = 'INVALID_PLAN_ID',
  INVALID_PLAN_PRICE = 'INVALID_PLAN_PRICE',
  INVALID_PLAN_CURRENCY = 'INVALID_PLAN_CURRENCY',
  INVALID_PLAN_PERIOD = 'INVALID_PLAN_PERIOD',
}

export abstract class PaymentsError extends Error {
  abstract readonly code: PaymentsErrorCode;
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
