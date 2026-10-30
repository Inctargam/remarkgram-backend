import { describe, expect, it } from 'vitest';
import { Error as DbosErrors } from '@dbos-inc/dbos-sdk';
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
import {
  getAutoRenewalWorkflowErrorCode,
  restoreAutoRenewalWorkflowError,
} from './auto-renewal-workflow-error.mapper.js';

describe('Auto-renewal workflow errors', () => {
  it.each([
    new PaymentProviderUnavailableError(),
    new PaymentProviderOutcomeUnknownError(),
    new PaymentProviderValidationError(),
    new PaymentProviderResultMismatchError('enable'),
  ])('recognizes provider codes and serialized names: %s', (error) => {
    expect(getAutoRenewalWorkflowErrorCode(error)).toBe(error.code);
    expect(getAutoRenewalWorkflowErrorCode({ code: error.code })).toBe(error.code);
    const serialized = Object.assign(new Error('provider text is irrelevant'), { name: error.name });
    expect(getAutoRenewalWorkflowErrorCode(serialized)).toBe(error.code);
    expect(restoreAutoRenewalWorkflowError(serialized)).toMatchObject({
      name: SubscriptionAutoRenewalFailedError.name,
      code: error.code,
    });
  });

  it.each([
    new InvalidSubscriptionAutoRenewalRequestError('INVALID_USER_ID'),
    new SubscriptionAutoRenewalConflictError('SUBSCRIPTION_RETIRED'),
    new SubscriptionAutoRenewalIdempotencyConflictError(),
  ])('restores a business error from name/message without custom fields: %s', (error) => {
    expect(restoreAutoRenewalWorkflowError(error)).toBe(error);
    const serialized = Object.assign(new Error(error.message), { name: error.name });
    const restored = restoreAutoRenewalWorkflowError(serialized);
    expect(restored).toBeInstanceOf(error.constructor);
    if ('reason' in error) {
      expect(error.message).toBe(error.reason);
      expect(restored).toMatchObject({ reason: error.reason });
    }
  });

  it('recognizes an exhausted step after SDK error deserialization', () => {
    const last = new PaymentProviderOutcomeUnknownError();
    const sdkCode = new DbosErrors.DBOSMaxStepRetriesError('', 0, []).dbosErrorCode;
    const error = {
      dbosErrorCode: sdkCode,
      errors: [Object.assign(new Error(last.message), { name: last.name })],
    };
    expect(getAutoRenewalWorkflowErrorCode(error)).toBe(last.code);
    expect(restoreAutoRenewalWorkflowError(error)).toMatchObject({ code: last.code });
  });

  it('preserves an existing application failure', () => {
    const error = new SubscriptionAutoRenewalFailedError('PAYMENT_PROVIDER_OUTCOME_UNKNOWN');
    expect(restoreAutoRenewalWorkflowError(error)).toBe(error);
  });

  it.each([
    new Error('secret raw error details'),
    { code: 'secret raw error details' },
    Object.assign(new Error('secret raw error details'), {
      name: PaymentProviderUnavailableError.name,
      code: 'unknown code takes precedence over name',
    }),
    { dbosErrorCode: new DbosErrors.DBOSMaxStepRetriesError('', 0, []).dbosErrorCode, errors: [] },
    null,
  ])('does not expose unknown provider or SQL details: %s', (error) => {
    expect(getAutoRenewalWorkflowErrorCode(error)).toBe('AUTO_RENEWAL_INFRASTRUCTURE_FAILED');
    const restored = restoreAutoRenewalWorkflowError(error);
    expect(restored).toBeInstanceOf(SubscriptionAutoRenewalFailedError);
    expect(restored).toMatchObject({ code: 'AUTO_RENEWAL_INFRASTRUCTURE_FAILED' });
    expect(restored.message).not.toContain('secret');
  });
});
