import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { InvalidProviderEventError } from '../../../features/payments/application/errors/invalid-provider-event.error.js';
import { PaymentProviderUnavailableError } from '../../../features/payments/application/errors/payment-provider.error.js';
import { PaymentWebhookEnqueueUnavailableError } from '../../application/errors/payments.error.js';
import { mapPaymentWebhookErrorToHttpException } from './payment-webhook-http-error.mapper.js';

describe('mapPaymentWebhookErrorToHttpException', () => {
  it.each([
    [new InvalidProviderEventError(), HttpStatus.BAD_REQUEST],
    [new PaymentProviderUnavailableError(), HttpStatus.SERVICE_UNAVAILABLE],
    [new PaymentWebhookEnqueueUnavailableError(), HttpStatus.SERVICE_UNAVAILABLE],
  ] as const)('maps %s to HTTP status %s', (error, status) => {
    const exception = mapPaymentWebhookErrorToHttpException(error);

    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toEqual({
      statusCode: status,
      code: error.code,
      message: error.message,
    });
  });
});
