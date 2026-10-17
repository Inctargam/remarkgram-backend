import type { RawBodyRequest } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { InvalidProviderEventError } from '../../application/errors/invalid-provider-event.error.js';
import { PaymentWebhookEnqueueUnavailableError } from '../../../../common/application/errors/payments.error.js';
import type { ProcessStripeWebhookUseCase } from '../../application/use-cases/process-stripe-webhook.use-case.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';

describe('StripeWebhookController', () => {
  it.each(['RECEIVED', 'IGNORED'] as const)('возвращает результат webhook-сценария: %s', async (result) => {
    const execute = vi.fn().mockResolvedValue(result);
    const controller = createController(execute);
    const rawBody = Buffer.from('{"id":"evt_test"}');

    await expect(controller.handle(requestWith(rawBody), 'signature')).resolves.toEqual({ result });
    expect(execute).toHaveBeenCalledWith(rawBody, 'signature');
  });

  it('отклоняет запрос без raw body или Stripe-Signature', async () => {
    const execute = vi.fn();
    const controller = createController(execute);

    await expect(controller.handle(requestWith(undefined), 'signature')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.handle(requestWith(Buffer.from('{}')))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('передаёт ошибку проверки provider webhook в HTTP filter', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new InvalidProviderEventError('Invalid Stripe webhook signature'));
    const controller = createController(execute);

    await expect(controller.handle(requestWith(Buffer.from('{}')), 'invalid')).rejects.toBeInstanceOf(
      InvalidProviderEventError,
    );
  });

  it('passes a durable enqueue failure to the HTTP filter', async () => {
    const execute = vi.fn().mockRejectedValue(new PaymentWebhookEnqueueUnavailableError());
    const controller = createController(execute);

    await expect(controller.handle(requestWith(Buffer.from('{}')), 'signature')).rejects.toBeInstanceOf(
      PaymentWebhookEnqueueUnavailableError,
    );
  });
});

function createController(execute: ReturnType<typeof vi.fn>): StripeWebhookController {
  return new StripeWebhookController({ execute } as unknown as ProcessStripeWebhookUseCase);
}

function requestWith(rawBody: Buffer | undefined): RawBodyRequest<Request> {
  return { rawBody } as RawBodyRequest<Request>;
}
