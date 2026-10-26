import { PaymentWorkflowAttemptError } from './payment-workflow-attempt.error.js';
import { RenewalPaymentContextUnavailableError } from '../../application/errors/renewal-payment-context-unavailable.error.js';
import { Error as DbosErrors } from '@dbos-inc/dbos-sdk';
import { describe, expect, it } from 'vitest';
import {
  PaymentProviderResultMismatchError,
  PaymentProviderUnavailableError,
} from '../../application/errors/payment-provider.error.js';
import { PaymentPersistenceError } from '../../../../common/application/errors/payments.error.js';
import { classifyPaymentWorkflowError, isRetryablePaymentWorkflowError, toPaymentEventFailure } from './payment-workflow-error.policy.js';

describe('payment workflow error policy', () => {
  it.each([new PaymentProviderUnavailableError(), new PaymentPersistenceError(), new RenewalPaymentContextUnavailableError('in_test', 'SOURCE_NOT_LINKED'), new Error('unknown')])(
    'keeps transient or unknown failures retryable',
    (error) => {
      expect(isRetryablePaymentWorkflowError(error)).toBe(true);
    },
  );

  it.each([
    ['SOURCE_METADATA_MISSING', 'RECONCILIATION_REQUIRED'],
    ['PAYMENT_DISAPPEARED', 'RECONCILIATION_REQUIRED'],
    ['SOURCE_PAYMENT_NOT_FOUND', 'RETRY'],
    ['SOURCE_NOT_LINKED', 'RETRY'],
    ['INVOICE_PAYMENT_NOT_FOUND', 'RETRY'],
  ] as const)('classifies renewal context reason %s as %s', (reason, disposition) => {
    const decision = classifyPaymentWorkflowError(new RenewalPaymentContextUnavailableError('in_test', reason));
    expect(decision).toEqual({ disposition, failure: {
      code: `RENEWAL_${reason}`, message: `Renewal payment context: ${reason}`,
    } });
    const recorded = new PaymentWorkflowAttemptError(decision);
    const replayed = new Error(recorded.message);
    replayed.name = recorded.name;
    expect(classifyPaymentWorkflowError(replayed)).toEqual(decision);
  });

  it('preserves permanent failures across error replay without exposing raw error details', () => {
    const error = new PaymentProviderResultMismatchError('sensitive operation details');
    const recorded = new PaymentWorkflowAttemptError(classifyPaymentWorkflowError(error));
    const replayed = new Error(recorded.message);
    replayed.name = recorded.name;
    expect(classifyPaymentWorkflowError(replayed).disposition).toBe('DEAD');
    expect(recorded.message).not.toContain('sensitive operation details');
  });

  it('treats a malformed replay envelope as an unknown retryable failure', () => {
    const error = new Error('{bad-json');
    error.name = 'PaymentWorkflowAttemptError';
    expect(classifyPaymentWorkflowError(error)).toEqual({ disposition: 'RETRY', failure: {
      code: 'UNEXPECTED_WORKFLOW_ERROR', message: 'Payment webhook processing failed unexpectedly',
    } });
  });

  it('does not retry a known provider result conflict', () => {
    const error = new PaymentProviderResultMismatchError('test operation');

    expect(isRetryablePaymentWorkflowError(error)).toBe(false);
    expect(toPaymentEventFailure(error)).toEqual({
      code: 'PAYMENT_PROVIDER_RESULT_MISMATCH',
      message: 'Payment webhook processing failed with PAYMENT_PROVIDER_RESULT_MISMATCH',
    });
  });

  it('classifies exhausted DBOS step retries as a terminal audit failure', () => {
    const error = new DbosErrors.DBOSMaxStepRetriesError('providerStep', 10, [
      new Error('provider unavailable'),
    ]);

    expect(isRetryablePaymentWorkflowError(error)).toBe(false);
    expect(toPaymentEventFailure(error)).toEqual({
      code: 'DBOS_STEP_RETRIES_EXHAUSTED',
      message: 'Payment webhook provider step exhausted its retry policy',
    });
  });

  it('does not persist details from an unexpected infrastructure error', () => {
    const error = new Error('postgres://user:secret@example.test/payments');

    expect(toPaymentEventFailure(error)).toEqual({
      code: 'UNEXPECTED_WORKFLOW_ERROR',
      message: 'Payment webhook processing failed unexpectedly',
    });
  });
});
