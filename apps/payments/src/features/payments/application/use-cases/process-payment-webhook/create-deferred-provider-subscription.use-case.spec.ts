import { describe, expect, it, vi } from 'vitest';
import { Currency, PeriodUnit } from '../../../../plans/domain/plan.entity.js';
import type { PaymentEventRepository } from '../../ports/payment-event.repository.js';
import type { PaymentProviderPort } from '../../ports/payment-provider.js';
import type { PaymentsRepository } from '../../ports/payments.repository.js';
import type { SubscriptionPaymentHandler } from '../../ports/subscription-payment.handler.js';
import { PaymentProvider, PaymentType } from '../../../domain/payment.entity.js';
import { CreateDeferredProviderSubscriptionUseCase } from './create-deferred-provider-subscription.use-case.js';

describe('CreateDeferredProviderSubscriptionUseCase workflow step', () => {
  it('создаёт provider Subscription и атомарно фиксирует обе локальные связи', async () => {
    const provider = {
      createDeferredSubscription: vi
        .fn<PaymentProviderPort['createDeferredSubscription']>()
        .mockResolvedValue({ providerSubscriptionId: 'sub_new' }),
    };
    const payments = {
      bindPaymentProviderSubscription: vi
        .fn<PaymentsRepository['bindPaymentProviderSubscription']>()
        .mockResolvedValue({ outcome: 'BOUND' }),
    };
    const subscriptions = {
      bindProviderSubscription: vi
        .fn<SubscriptionPaymentHandler['bindProviderSubscription']>()
        .mockResolvedValue(),
    };
    const events = {
      markProcessed: vi.fn<PaymentEventRepository['markProcessed']>().mockResolvedValue(),
    };
    const useCase = new CreateDeferredProviderSubscriptionUseCase(
      provider as unknown as PaymentProviderPort,
      payments as unknown as PaymentsRepository,
      subscriptions as unknown as SubscriptionPaymentHandler,
      events as unknown as PaymentEventRepository,
    );
    const params = deferredParams();
    const created = await useCase.createAtProvider(params);
    const tx = {};
    await useCase.recordCreated(params, created, tx);

    expect(provider.createDeferredSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        billingCycleAnchor: params.nextSubscriptionStartsAt,
        operationId: params.payment.paymentId,
      }),
    );
    expect(payments.bindPaymentProviderSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubscriptionId: 'sub_new' }),
      tx,
    );
    expect(subscriptions.bindProviderSubscription).toHaveBeenCalledWith(
      params.payment.paymentId,
      'sub_new',
      tx,
    );
    expect(events.markProcessed).toHaveBeenCalledWith(params.eventId, tx);
  });

  it('откатывает локальную транзакцию при конфликте provider Subscription в Payment', async () => {
    const payments = {
      bindPaymentProviderSubscription: vi
        .fn<PaymentsRepository['bindPaymentProviderSubscription']>()
        .mockResolvedValue({ outcome: 'NOT_BOUND' }),
    };
    const subscriptions = { bindProviderSubscription: vi.fn() };
    const events = { markProcessed: vi.fn() };
    const useCase = new CreateDeferredProviderSubscriptionUseCase(
      {} as PaymentProviderPort,
      payments as unknown as PaymentsRepository,
      subscriptions as unknown as SubscriptionPaymentHandler,
      events as unknown as PaymentEventRepository,
    );

    await expect(
      useCase.recordCreated(deferredParams(), { providerSubscriptionId: 'sub_other' }, {}),
    ).rejects.toMatchObject({ reason: 'PROVIDER_SUBSCRIPTION_LINK_CONFLICT' });
    expect(subscriptions.bindProviderSubscription).not.toHaveBeenCalled();
    expect(events.markProcessed).not.toHaveBeenCalled();
  });
});

function deferredParams() {
  return {
    eventId: 'event-id',
    payment: {
      paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: 10,
      planId: 20,
      type: PaymentType.PURCHASE,
      autoRenewalRequested: true,
      amount: 1_000,
      currency: Currency.USD,
      periodCount: 1,
      periodUnit: PeriodUnit.MONTH,
      provider: PaymentProvider.STRIPE,
      providerCustomerId: 'cus_test',
      paidAt: '2026-10-14T10:00:00.000Z',
    },
    subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    nextSubscriptionStartsAt: '2026-11-14T10:00:00.000Z',
    previousProviderSubscriptionId: 'sub_previous',
  };
}
