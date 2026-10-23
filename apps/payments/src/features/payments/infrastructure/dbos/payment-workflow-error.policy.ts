import { RenewalPaymentContextUnavailableError } from '../../application/errors/renewal-payment-context-unavailable.error.js';
import { PaymentWorkflowAttemptError, type PaymentWorkflowAttemptFailure } from './payment-workflow-attempt.error.js';
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
  const recorded = PaymentWorkflowAttemptError.read(error);
  if (recorded) return recorded.disposition === 'RETRY';
  if (error instanceof RenewalPaymentContextUnavailableError)
    return error.reason === 'SOURCE_PAYMENT_NOT_FOUND' || error.reason === 'SOURCE_NOT_LINKED';
  if (error instanceof DbosErrors.DBOSMaxStepRetriesError) return false;
  if (error instanceof PaymentsError) return RETRYABLE_PAYMENT_ERROR_CODES.has(error.code);
  return true;
};

export const toPaymentEventFailure = (error: unknown): PaymentEventFailure => {
  const recorded = PaymentWorkflowAttemptError.read(error);
  if (recorded) return recorded.failure;
  if (error instanceof RenewalPaymentContextUnavailableError)
    return { code: `RENEWAL_${error.reason}`, message: `Renewal payment context: ${error.reason}` };
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

export const classifyPaymentWorkflowError = (error: unknown): PaymentWorkflowAttemptFailure => {
  const recorded = PaymentWorkflowAttemptError.read(error);
  if (recorded) return recorded;
  if (error instanceof RenewalPaymentContextUnavailableError &&
    (error.reason === 'SOURCE_METADATA_MISSING' || error.reason === 'PAYMENT_DISAPPEARED'))
    return { disposition: 'RECONCILIATION_REQUIRED', failure: toPaymentEventFailure(error) };
  return {
    disposition: isRetryablePaymentWorkflowError(error) ? 'RETRY' : 'DEAD',
    failure: toPaymentEventFailure(error),
  };
};
