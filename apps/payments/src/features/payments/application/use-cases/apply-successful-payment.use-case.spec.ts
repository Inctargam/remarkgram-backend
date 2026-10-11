import { describe, expect, it, vi } from 'vitest';
import type { PaymentsRepository } from '../ports/payments.repository.js';
import type { SubscriptionPaymentHandler } from '../ports/subscription-payment-handler.js';
import {
  InvalidSubscriptionPaymentResultError,
  SubscriptionPaymentUnavailableError,
} from '../ports/subscription-payment-handler.js';
import { ApplySuccessfulPaymentUseCase } from './apply-successful-payment.use-case.js';

describe('ApplySuccessfulPaymentUseCase', () => {
  it('returns applied result from the atomic repository operation', async () => {
    const payment = { subscriptionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    const payments = {
      applySuccessfulPayment: vi.fn().mockResolvedValue({ outcome: 'APPLIED', payment, action: 'CREATED' }),
    } as unknown as PaymentsRepository;
    const handler = { applySuccessfulPayment: vi.fn() } as unknown as SubscriptionPaymentHandler;
    await expect(new ApplySuccessfulPaymentUseCase(payments, handler).execute('payment-id')).resolves.toEqual(
      {
        outcome: 'APPLIED',
        paymentId: 'payment-id',
        subscriptionId: payment.subscriptionId,
        action: 'CREATED',
      },
    );
  });

  it('classifies an unavailable D2 as retryable without changing financial status', async () => {
    const markApplicationError = vi.fn().mockResolvedValue(undefined);
    const payments = {
      applySuccessfulPayment: vi.fn().mockRejectedValue(new SubscriptionPaymentUnavailableError()),
      markApplicationError,
    } as unknown as PaymentsRepository;
    const handler = {} as SubscriptionPaymentHandler;
    await expect(new ApplySuccessfulPaymentUseCase(payments, handler).execute('payment-id')).resolves.toEqual(
      {
        outcome: 'RETRY_REQUIRED',
        reason: 'D2_UNAVAILABLE',
      },
    );
    expect(markApplicationError).toHaveBeenCalledWith('payment-id', 'D2_UNAVAILABLE');
  });

  it('rejects a payment that is not financially successful', async () => {
    const payments = {
      applySuccessfulPayment: vi.fn().mockResolvedValue({ outcome: 'NOT_SUCCEEDED' }),
    } as unknown as PaymentsRepository;
    const handler = {} as SubscriptionPaymentHandler;
    await expect(new ApplySuccessfulPaymentUseCase(payments, handler).execute('payment-id')).resolves.toEqual(
      {
        outcome: 'REJECTED',
        reason: 'PAYMENT_NOT_SUCCEEDED',
      },
    );
  });

  it('classifies and records an invalid D2 result after the transaction rollback', async () => {
    const markApplicationError = vi.fn().mockResolvedValue(undefined);
    const payments = {
      applySuccessfulPayment: vi.fn().mockRejectedValue(new InvalidSubscriptionPaymentResultError()),
      markApplicationError,
    } as unknown as PaymentsRepository;
    const handler = {} as SubscriptionPaymentHandler;

    await expect(new ApplySuccessfulPaymentUseCase(payments, handler).execute('payment-id')).resolves.toEqual(
      {
        outcome: 'REJECTED',
        reason: 'INVALID_SUBSCRIPTION_RESULT',
      },
    );
    expect(markApplicationError).toHaveBeenCalledWith('payment-id', 'INVALID_SUBSCRIPTION_RESULT');
  });
});
