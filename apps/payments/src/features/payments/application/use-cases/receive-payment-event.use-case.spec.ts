import { describe, expect, it, vi } from 'vitest';
import type { PaymentEvent } from '../events/payment-event.js';
import type { PaymentWebhookWorkflow } from '../ports/payment-webhook.workflow.js';
import { PaymentEventKind } from '../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../domain/payment.entity.js';
import { ReceivePaymentEventUseCase } from './receive-payment-event.use-case.js';

describe('ReceivePaymentEventUseCase', () => {
  it('делегирует durable enqueue DBOS workflow', async () => {
    const enqueue = vi.fn<PaymentWebhookWorkflow['enqueue']>().mockResolvedValue('RECEIVED');
    const useCase = new ReceivePaymentEventUseCase({ enqueue });
    const event = paymentEvent();

    await expect(useCase.execute(event)).resolves.toBe('RECEIVED');
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(event);
  });
});

function paymentEvent(): PaymentEvent {
  return {
    kind: PaymentEventKind.CHECKOUT_SESSION_COMPLETED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_test',
    providerEventType: 'checkout.session.completed',
    providerCreatedAt: new Date('2026-10-11T12:00:00.000Z'),
    paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payload: {
      id: 'cs_test',
      customerId: 'cus_test',
      mode: 'subscription',
      paymentStatus: 'paid',
      providerPaymentId: null,
      providerSubscriptionId: 'sub_test',
      amount: 10_000,
      currency: 'usd',
    },
    snapshot: { id: 'evt_test' },
  };
}
