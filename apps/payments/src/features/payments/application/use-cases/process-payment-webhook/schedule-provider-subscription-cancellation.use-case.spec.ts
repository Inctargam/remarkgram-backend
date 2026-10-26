import { describe, expect, it, vi } from 'vitest';
import type { PaymentProviderPort } from '../../ports/payment-provider.js';
import type { SubscriptionPaymentHandler } from '../../ports/subscription-payment.handler.js';
import { ScheduleProviderSubscriptionCancellationUseCase } from './schedule-provider-subscription-cancellation.use-case.js';

describe('ScheduleProviderSubscriptionCancellationUseCase workflow step', () => {
  it('планирует отмену у provider и отдельно фиксирует её в D2-транзакции', async () => {
    const provider = {
      scheduleSubscriptionCancellation: vi
        .fn<PaymentProviderPort['scheduleSubscriptionCancellation']>()
        .mockResolvedValue({
          providerSubscriptionId: 'sub_previous',
          cancelAtPeriodEnd: true,
        }),
    };
    const subscriptions = {
      confirmAutoRenewalCancellation: vi
        .fn<SubscriptionPaymentHandler['confirmAutoRenewalCancellation']>()
        .mockResolvedValue(),
    };
    const useCase = new ScheduleProviderSubscriptionCancellationUseCase(
      provider as unknown as PaymentProviderPort,
      subscriptions as unknown as SubscriptionPaymentHandler,
    );
    const params = {
      eventId: 'event-id',
      payment: { paymentId: 'payment-id' } as never,
      subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      nextSubscriptionStartsAt: '2026-11-14T10:00:00.000Z',
      previousProviderSubscriptionId: 'sub_previous',
    };

    await expect(useCase.scheduleAtProvider(params)).resolves.toEqual(params);
    const tx = {};
    await useCase.recordScheduled(params, tx);
    expect(subscriptions.confirmAutoRenewalCancellation).toHaveBeenCalledWith(
      params.payment.paymentId,
      params.previousProviderSubscriptionId,
      tx,
    );
  });
});
