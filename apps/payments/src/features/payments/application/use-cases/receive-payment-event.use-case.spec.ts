import { describe, expect, it, vi } from 'vitest';
import type { PaymentEvent } from '../events/payment-event.js';
import type { PaymentEventRepository } from '../ports/payment-event.repository.js';
import { PaymentProvider } from '../../domain/payment.entity.js';
import { ReceivePaymentEventUseCase } from './receive-payment-event.use-case.js';

describe('ReceivePaymentEventUseCase', () => {
  it.each(['RECEIVED', 'DUPLICATE'] as const)('делегирует сохранение и возвращает %s', async (result) => {
    const saveIfAbsent = vi.fn<PaymentEventRepository['saveIfAbsent']>().mockResolvedValue(result);
    const useCase = new ReceivePaymentEventUseCase({ saveIfAbsent });
    const event = paymentEvent();

    await expect(useCase.execute(event)).resolves.toBe(result);
    expect(saveIfAbsent).toHaveBeenCalledOnce();
    expect(saveIfAbsent).toHaveBeenCalledWith(event);
  });
});

function paymentEvent(): PaymentEvent {
  return {
    kind: 'CHECKOUT_SESSION_COMPLETED',
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_test',
    providerEventType: 'checkout.session.completed',
    providerCreatedAt: new Date('2026-10-11T12:00:00.000Z'),
    checkout: {
      id: 'cs_test',
      internalPaymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      customerId: 'cus_test',
      mode: 'subscription',
      paymentStatus: 'paid',
      providerPaymentId: null,
      providerSubscriptionId: 'sub_test',
      providerInvoiceId: 'in_test',
      amount: 10_000,
      currency: 'usd',
    },
    snapshot: { id: 'evt_test' },
  };
}
