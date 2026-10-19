import { Error as DbosErrors } from '@dbos-inc/dbos-sdk';
import { PaymentsError, PaymentsErrorCode } from '../../../../common/application/errors/payments.error.js';
import type { PaymentEventFailure } from '../../application/ports/payment-event.repository.js';

const RETRYABLE_PAYMENT_ERROR_CODES = new Set<PaymentsErrorCode>([
  PaymentsErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
  PaymentsErrorCode.PAYMENT_PROVIDER_OUTCOME_UNKNOWN,
  PaymentsErrorCode.PAYMENT_CUSTOMER_PROVIDER_FAILED,
  PaymentsErrorCode.PAYMENT_SUBSCRIPTION_CONTEXT_FAILED,
  PaymentsErrorCode.PAYMENT_PLAN_UNAVAILABLE,
  PaymentsErrorCode.PAYMENT_PERSISTENCE_FAILED,
]);

/** Unknown failures are retryable so an unclassified infrastructure failure cannot lose an event. */
export const isRetryablePaymentWorkflowError = (error: unknown): boolean => {
  if (error instanceof DbosErrors.DBOSMaxStepRetriesError) return false;
  if (error instanceof PaymentsError) return RETRYABLE_PAYMENT_ERROR_CODES.has(error.code);
  return true;
};

export const toPaymentEventFailure = (error: unknown): PaymentEventFailure => {
  if (error instanceof DbosErrors.DBOSMaxStepRetriesError)
    return {
      code: 'DBOS_STEP_RETRIES_EXHAUSTED',
      message: 'Payment webhook provider step exhausted its retry policy',
    };
  if (error instanceof PaymentsError)
    return {
      code: error.code,
      message: `Payment webhook processing failed with ${error.code}`,
    };
  return {
    code: 'UNEXPECTED_WORKFLOW_ERROR',
    message: 'Payment webhook processing failed unexpectedly',
  };
};
