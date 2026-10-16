import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  PaymentProviderOutcomeUnknownError,
  PaymentProviderUnavailableError,
  PaymentProviderValidationError,
  type PaymentsError,
} from '../../../../common/application/errors/payments.error.js';

export type StripePaymentOperation =
  | 'CREATE_CHECKOUT'
  | 'CREATE_CUSTOMER'
  | 'SCHEDULE_SUBSCRIPTION_CANCELLATION'
  | 'CREATE_DEFERRED_SUBSCRIPTION'
  | 'SET_SUBSCRIPTION_AUTO_RENEWAL';

export type StripePaymentErrorContext = {
  operation: StripePaymentOperation;
  aggregateId: string;
};

/** Translates Stripe SDK failures at the infrastructure boundary. */
export class StripePaymentErrorMapper {
  private readonly logger = new Logger(StripePaymentErrorMapper.name);

  toApplicationError(error: unknown, context: StripePaymentErrorContext): PaymentsError {
    const mapped = this.classify(error);
    const providerError = error instanceof Stripe.errors.StripeError ? error : null;
    const details = {
      event: 'payment_provider_operation_failed',
      provider: 'STRIPE',
      ...context,
      applicationErrorCode: mapped.code,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      providerErrorType: providerError?.type,
      providerErrorCode: providerError?.code,
      providerRequestId: providerError?.requestId,
      providerStatusCode: providerError?.statusCode,
    };

    if (mapped instanceof PaymentProviderOutcomeUnknownError) this.logger.error(details);
    else this.logger.warn(details);

    return mapped;
  }

  private classify(error: unknown): PaymentsError {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError ||
      error instanceof Stripe.errors.StripeIdempotencyError ||
      error instanceof Stripe.errors.StripeCardError
    )
      return new PaymentProviderValidationError();

    if (
      error instanceof Stripe.errors.StripeAPIError ||
      error instanceof Stripe.errors.StripeRateLimitError ||
      error instanceof Stripe.errors.StripeAuthenticationError ||
      error instanceof Stripe.errors.StripePermissionError
    )
      return new PaymentProviderUnavailableError();

    // A connection failure or an unknown exception can happen after Stripe accepted
    // a mutating request. Callers must retry with the same idempotency identity.
    return new PaymentProviderOutcomeUnknownError();
  }
}
