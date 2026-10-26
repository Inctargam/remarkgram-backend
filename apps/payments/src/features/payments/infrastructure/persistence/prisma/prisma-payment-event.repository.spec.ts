import { describe, expect, it, vi } from 'vitest';
import type { PaymentEvent } from '../../../application/events/payment-event.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { PrismaPaymentEventRepository } from './prisma-payment-event.repository.js';

describe('PrismaPaymentEventRepository', () => {
  const repository = new PrismaPaymentEventRepository();

  it('returns the durable inbox identity created in the DBOS transaction', async () => {
    const ctx = {
      paymentWebhook: {
        upsert: vi.fn().mockResolvedValue({ id: 'webhook-id' }),
      },
    };

    await expect(
      repository.saveIfAbsent(paymentEvent(), 'payment-webhook:STRIPE:evt_test', ctx),
    ).resolves.toEqual({
      id: 'webhook-id',
    });
    expect(ctx.paymentWebhook.upsert).toHaveBeenCalledWith({
      where: {
        providerType_providerEventId: {
          providerType: PaymentProvider.STRIPE,
          providerEventId: 'evt_test',
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      create: expect.objectContaining({
        paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        providerType: PaymentProvider.STRIPE,
        providerEventId: 'evt_test',
        workflowId: 'payment-webhook:STRIPE:evt_test',
      }),
      update: {},
      select: { id: true },
    });
  });

  it('fails loudly when a lifecycle transition no longer owns an active event', async () => {
    const ctx = {
      paymentWebhook: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    await expect(repository.markProcessed('webhook-id', ctx)).rejects.toThrow(
      'Cannot mark processed for payment webhook webhook-id',
    );
  });

  it.each([
    { attempt: 1, status: 'RECEIVED' },
    { attempt: 2, status: 'RETRYING' },
  ])('records technical attempt $attempt as $status', async ({ attempt, status }) => {
    const ctx = {
      paymentWebhook: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await repository.recordAttempt('webhook-id', attempt, ctx);

    expect(ctx.paymentWebhook.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'webhook-id',
        processingStatus: { in: ['RECEIVED', 'RETRYING'] },
      },
      data: {
        processingStatus: status,
        processingAttempts: attempt,
        processingErrorCode: null,
        processingError: null,
      },
    });
  });

  it('parks an active event for reconciliation without marking it processed', async () => {
    const ctx = { paymentWebhook: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    await repository.markReconciliationRequired('webhook-id', {
      code: 'RENEWAL_SOURCE_METADATA_MISSING', message: 'Context\nrequires reconciliation',
    }, ctx);
    expect(ctx.paymentWebhook.updateMany).toHaveBeenCalledWith({
      where: { id: 'webhook-id', processingStatus: { in: ['RECEIVED', 'RETRYING'] } },
      data: { processingStatus: 'RECONCILIATION_REQUIRED', processedAt: null,
        processingErrorCode: 'RENEWAL_SOURCE_METADATA_MISSING', processingError: 'Context requires reconciliation' },
    });
  });

  it('does not overwrite a completed event when requiring reconciliation', async () => {
    const ctx = { paymentWebhook: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    await expect(repository.markReconciliationRequired('webhook-id', { code: 'TEST', message: 'Test' }, ctx))
      .rejects.toThrow('Cannot require reconciliation');
  });

  it('attaches a correlated Payment without overwriting another correlation', async () => {
    const ctx = {
      paymentWebhook: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await repository.attachPayment('webhook-id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ctx);

    expect(ctx.paymentWebhook.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'webhook-id',
        OR: [{ paymentId: null }, { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
      },
      data: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
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
