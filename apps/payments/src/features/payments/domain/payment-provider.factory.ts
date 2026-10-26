import { InvalidPaymentProviderIdentityError } from './errors/payment-validation.errors.js';

export enum PaymentProvider {
  STRIPE = 'STRIPE',
}

export class PaymentProviderFactory {
  static create(value: unknown): PaymentProvider {
    switch (value) {
      case PaymentProvider.STRIPE:
        return PaymentProvider.STRIPE;
      default:
        throw new InvalidPaymentProviderIdentityError(value, null);
    }
  }
}
