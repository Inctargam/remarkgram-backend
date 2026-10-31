import { Error as DbosErrors } from '@dbos-inc/dbos-sdk';
import { PaymentsErrorCode } from '../../../../common/domain/errors/payments.error.js';
import {
  PaymentProviderOutcomeUnknownError,
  PaymentProviderResultMismatchError,
  PaymentProviderUnavailableError,
  PaymentProviderValidationError,
} from '../../../payments/application/errors/payment-provider.error.js';
import {
  InvalidSubscriptionAutoRenewalRequestError,
  SubscriptionAutoRenewalConflictError,
  SubscriptionAutoRenewalFailedError,
  SubscriptionAutoRenewalIdempotencyConflictError,
} from '../../application/errors/subscription-auto-renewal.errors.js';

const maxStepRetriesCode = new DbosErrors.DBOSMaxStepRetriesError('', 0, []).dbosErrorCode;
const infrastructureFailureCode = 'AUTO_RENEWAL_INFRASTRUCTURE_FAILED';
const errorCodesByName = new Map<string, string>([
  [PaymentProviderUnavailableError.name, PaymentsErrorCode.PAYMENT_PROVIDER_UNAVAILABLE],
  [PaymentProviderOutcomeUnknownError.name, PaymentsErrorCode.PAYMENT_PROVIDER_OUTCOME_UNKNOWN],
  [PaymentProviderValidationError.name, PaymentsErrorCode.PAYMENT_PROVIDER_VALIDATION_FAILED],
  [PaymentProviderResultMismatchError.name, PaymentsErrorCode.PAYMENT_PROVIDER_RESULT_MISMATCH],
  [InvalidSubscriptionAutoRenewalRequestError.name, 'INVALID_AUTO_RENEWAL_REQUEST'],
  [SubscriptionAutoRenewalConflictError.name, 'AUTO_RENEWAL_CONFLICT'],
  [SubscriptionAutoRenewalIdempotencyConflictError.name, 'IDEMPOTENCY_CONFLICT'],
]);
const knownCodes = new Set(errorCodesByName.values());

/** Code/name survive SDK serialization; only allowlisted codes reach diagnostics. */
export function getAutoRenewalWorkflowErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return infrastructureFailureCode;
  if (
    'dbosErrorCode' in error &&
    error.dbosErrorCode === maxStepRetriesCode &&
    'errors' in error &&
    Array.isArray(error.errors)
  ) {
    return getAutoRenewalWorkflowErrorCode(error.errors.at(-1));
  }
  if ('code' in error) {
    return typeof error.code === 'string' && knownCodes.has(error.code)
      ? error.code
      : infrastructureFailureCode;
  }
  return error instanceof Error
    ? (errorCodesByName.get(error.name) ?? infrastructureFailureCode)
    : infrastructureFailureCode;
}

export function restoreAutoRenewalWorkflowError(error: unknown): Error {
  if (
    error instanceof InvalidSubscriptionAutoRenewalRequestError ||
    error instanceof SubscriptionAutoRenewalConflictError ||
    error instanceof SubscriptionAutoRenewalIdempotencyConflictError ||
    error instanceof SubscriptionAutoRenewalFailedError
  ) {
    return error;
  }
  // These D2 errors store a machine-readable reason in message, retained by Prisma datasource.
  // Provider and database messages are never parsed or exposed at the application boundary.
  if (error instanceof Error) {
    switch (error.name) {
      case InvalidSubscriptionAutoRenewalRequestError.name:
        return new InvalidSubscriptionAutoRenewalRequestError(error.message);
      case SubscriptionAutoRenewalConflictError.name:
        return new SubscriptionAutoRenewalConflictError(error.message);
      case SubscriptionAutoRenewalIdempotencyConflictError.name:
        return new SubscriptionAutoRenewalIdempotencyConflictError();
    }
  }
  return new SubscriptionAutoRenewalFailedError(getAutoRenewalWorkflowErrorCode(error));
}
