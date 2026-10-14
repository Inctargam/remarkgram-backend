import { describe, expect, it, vi } from 'vitest';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import { type Payment, PaymentProvider, PaymentStatus } from '../../../../domain/payment.entity.js';
import type { InvoicePaymentFailedEvent } from '../../../events/payment-event.js';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { RecordInvoicePaymentFailedUseCase } from './record-invoice-payment-failed.use-case.js';

describe('RecordInvoicePaymentFailedUseCase', () => {
  it.each([PaymentStatus.PENDING, PaymentStatus.SUCCEEDED])(
    'correlates an initial %s Payment without changing its lifecycle',
    async (status) => {
      const payments = repository();
      payments.findById.mockResolvedValue(payment({ status }));
      const useCase = new RecordInvoicePaymentFailedUseCase(
        payments as unknown as PaymentsRepository,
      );

      await expect(useCase.execute(event(), {})).resolves.toEqual({
        outcome: 'CORRELATED',
        paymentId: PAYMENT_ID,
      });
    },
  );

  it('correlates a renewal failure through the Subscription chain', async () => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(null);
    payments.findByProviderSubscriptionId.mockResolvedValue(payment());
    const useCase = new RecordInvoicePaymentFailedUseCase(payments as unknown as PaymentsRepository);

    await expect(
      useCase.execute(event({ paymentId: null, billingReason: 'subscription_cycle' }), {}),
    ).resolves.toEqual({ outcome: 'CORRELATED', paymentId: PAYMENT_ID });
    expect(payments.findByProviderSubscriptionId).toHaveBeenCalledWith(
      PaymentProvider.STRIPE,
      'sub_test',
      {},
    );
  });

  it('keeps an Invoice failure without correlation as processed audit data', async () => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(null);
    payments.findByProviderSubscriptionId.mockResolvedValue(null);
    const useCase = new RecordInvoicePaymentFailedUseCase(payments as unknown as PaymentsRepository);

    await expect(
      useCase.execute(event({ paymentId: null, billingReason: 'subscription_cycle' }), {}),
    ).resolves.toEqual({ outcome: 'UNCORRELATED' });
  });

  it('does not correlate metadata to conflicting Invoice references', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      payment({ providerInvoiceId: 'in_other', providerCustomerId: 'cus_test' }),
    );
    payments.findByProviderInvoiceId.mockResolvedValue(null);
    payments.findByProviderSubscriptionId.mockResolvedValue(null);
    const useCase = new RecordInvoicePaymentFailedUseCase(
      payments as unknown as PaymentsRepository,
    );

    await expect(useCase.execute(event(), {})).resolves.toEqual({ outcome: 'UNCORRELATED' });
  });
});

const PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function repository() {
  return {
    findById: vi.fn(),
    findByProviderInvoiceId: vi.fn(),
    findByProviderSubscriptionId: vi.fn(),
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    providerType: PaymentProvider.STRIPE,
    providerSubscriptionId: 'sub_test',
    providerInvoiceId: null,
    status: PaymentStatus.PENDING,
    ...overrides,
  } as Payment;
}

function event(
  overrides: { paymentId?: string | null; billingReason?: string | null } = {},
): InvoicePaymentFailedEvent {
  return {
    kind: PaymentEventKind.INVOICE_PAYMENT_FAILED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_invoice_failed',
    providerEventType: 'invoice.payment_failed',
    providerCreatedAt: FAILED_AT,
    paymentId: overrides.paymentId === undefined ? PAYMENT_ID : overrides.paymentId,
    payload: {
      id: 'in_failed',
      customerId: 'cus_test',
      billingReason:
        overrides.billingReason === undefined ? 'subscription_create' : overrides.billingReason,
      providerPaymentId: 'pi_failed',
      providerSubscriptionId: 'sub_test',
      providerInvoiceId: 'in_failed',
      providerCode: 'card_declined',
      declineCode: 'insufficient_funds',
      message: 'Your card was declined.',
      failedAt: FAILED_AT,
    },
  };
}

const FAILED_AT = new Date('2026-10-13T12:00:00.000Z');
