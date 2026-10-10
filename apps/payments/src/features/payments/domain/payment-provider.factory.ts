import { InvalidPaymentProviderError } from '../application/errors/payment.errors.js';

export enum PaymentProvider {
  STRIPE = 'STRIPE',
}

export class PaymentProviderFactory {
  static create(value: unknown): PaymentProvider {
    switch (value) {
      case PaymentProvider.STRIPE:
        return PaymentProvider.STRIPE;
      default:
        throw new InvalidPaymentProviderError(value, null);
    }
  }
}
