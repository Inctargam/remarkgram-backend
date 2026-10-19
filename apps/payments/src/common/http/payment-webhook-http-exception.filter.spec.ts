import type { ArgumentsHost } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PaymentWebhookEnqueueUnavailableError } from '../application/errors/payments.error.js';
import { PaymentWebhookHttpExceptionFilter } from './payment-webhook-http-exception.filter.js';

describe('PaymentWebhookHttpExceptionFilter', () => {
  it('writes the mapped webhook error to the HTTP response', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    const error = new PaymentWebhookEnqueueUnavailableError();

    new PaymentWebhookHttpExceptionFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: error.code,
      message: error.message,
    });
  });
});
