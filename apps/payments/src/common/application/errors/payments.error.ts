export enum PaymentsErrorCode {
  INVALID_PAYMENT_METHOD = 'INVALID_PAYMENT_METHOD',
}

export abstract class PaymentsError extends Error {
  abstract readonly code: PaymentsErrorCode;
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
