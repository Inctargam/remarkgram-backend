import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../database/prisma/generated/client.js';
import type { PrismaService } from '../../../database/prisma.service.js';
import type { PaymentEvent } from '../application/events/payment-event.js';
import { PaymentProvider } from '../domain/payment.entity.js';
import { PrismaPaymentEventRepository } from './prisma-payment-event.repository.js';

describe('PrismaPaymentEventRepository', () => {
  it('сохраняет событие без интерпретации payload', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'webhook-id' });
    const repository = new PrismaPaymentEventRepository({
      paymentWebhook: { create },
    } as unknown as PrismaService);
    const event = paymentEvent();
    const storedEvent = JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;

    await expect(repository.saveIfAbsent(event)).resolves.toBe('RECEIVED');
    expect(create).toHaveBeenCalledWith({
      data: {
        providerType: PaymentProvider.STRIPE,
        providerEventId: 'evt_test',
        eventType: 'checkout.session.completed',
        payload: storedEvent,
      },
    });
  });

  it('возвращает DUPLICATE при конфликте уникального provider event id', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const create = vi.fn().mockRejectedValue(duplicate);
    const repository = new PrismaPaymentEventRepository({
      paymentWebhook: { create },
    } as unknown as PrismaService);

    await expect(repository.saveIfAbsent(paymentEvent())).resolves.toBe('DUPLICATE');
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
      internalPaymentId: null,
      customerId: null,
      mode: null,
      paymentStatus: null,
      providerPaymentId: null,
      providerSubscriptionId: null,
      providerInvoiceId: null,
      amount: null,
      currency: null,
    },
    snapshot: { id: 'evt_test', opaque: { value: true } },
  };
}
