import { Error as DbosErrors } from '@dbos-inc/dbos-sdk';
import { describe, expect, it } from 'vitest';
import {
  PaymentProviderResultMismatchError,
  PaymentProviderUnavailableError,
} from '../../application/errors/payment-provider.error.js';
import { PaymentPersistenceError } from '../../../../common/application/errors/payments.error.js';
import { isRetryablePaymentWorkflowError, toPaymentEventFailure } from './payment-workflow-error.policy.js';

describe('payment workflow error policy', () => {
  it.each([new PaymentProviderUnavailableError(), new PaymentPersistenceError(), new Error('unknown')])(
    'keeps transient or unknown failures retryable',
    (error) => {
      expect(isRetryablePaymentWorkflowError(error)).toBe(true);
    },
  );

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
