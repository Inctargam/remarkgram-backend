import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  PaymentProviderOutcomeUnknownError,
  PaymentProviderUnavailableError,
  PaymentProviderValidationError,
} from '../../application/errors/payment-provider.error.js';
import { StripePaymentErrorMapper } from './stripe-payment-error.mapper.js';

describe('StripePaymentErrorMapper', () => {
  const mapper = new StripePaymentErrorMapper();
  const context = { operation: 'CREATE_CHECKOUT', aggregateId: 'payment-id' } as const;

  it.each([
    new Stripe.errors.StripeInvalidRequestError(),
    new Stripe.errors.StripeIdempotencyError(),
    new Stripe.errors.StripeCardError(),
  ])('maps rejected Stripe requests to validation errors', (error) => {
    expect(mapper.toApplicationError(error, context)).toBeInstanceOf(PaymentProviderValidationError);
  });

  it.each([
    new Stripe.errors.StripeAPIError(),
    new Stripe.errors.StripeRateLimitError(),
    new Stripe.errors.StripeAuthenticationError(),
    new Stripe.errors.StripePermissionError(),
  ])('maps provider availability failures to unavailable errors', (error) => {
    expect(mapper.toApplicationError(error, context)).toBeInstanceOf(PaymentProviderUnavailableError);
  });

  it.each([new Stripe.errors.StripeConnectionError(), new Error('unexpected')])(
    'maps ambiguous failures to outcome-unknown errors',
    (error) => {
      expect(mapper.toApplicationError(error, context)).toBeInstanceOf(PaymentProviderOutcomeUnknownError);
    },
  );
});
