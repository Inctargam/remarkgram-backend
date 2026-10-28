import { describe, expect, it, vi } from 'vitest';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import { type Payment, PaymentProvider, PaymentStatus } from '../../../../domain/payment.entity.js';
import type { InvoicePaymentFailedEvent } from '../../../events/payment-event.js';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { PaymentEventCompletionCode, paymentEventResult } from '../payment-event-result.js';
import { RecordInvoicePaymentFailedUseCase } from './record-invoice-payment-failed.use-case.js';

describe('RecordInvoicePaymentFailedUseCase', () => {
  it.each([PaymentStatus.PENDING, PaymentStatus.SUCCEEDED])(
    'correlates an initial %s Payment without changing its lifecycle',
    async (status) => {
      const payments = repository();
      payments.findById.mockResolvedValue(payment({ status }));
      const useCase = new RecordInvoicePaymentFailedUseCase(payments as unknown as PaymentsRepository);

      await expect(useCase.execute(event(), {})).resolves.toEqual(CORRELATED);
    },
  );

  it('correlates a renewal failure by its Invoice', async () => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(payment({ providerInvoiceId: 'in_failed' }));
    const useCase = new RecordInvoicePaymentFailedUseCase(payments as unknown as PaymentsRepository);

    await expect(
      useCase.execute(event({ paymentId: null, billingReason: 'subscription_cycle' }), {}),
    ).resolves.toEqual(CORRELATED);
    expect(payments.findByProviderInvoiceId).toHaveBeenCalledWith(PaymentProvider.STRIPE, 'in_failed', {});
    expect(payments.findByProviderSubscriptionId).not.toHaveBeenCalled();
  });

  it('does not correlate a renewal failure to the source purchase by Subscription', async () => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(null);
    payments.findByProviderSubscriptionId.mockResolvedValue(payment({ providerInvoiceId: null }));
    const useCase = new RecordInvoicePaymentFailedUseCase(payments as unknown as PaymentsRepository);

    await expect(
      useCase.execute(event({ paymentId: null, billingReason: 'subscription_cycle' }), {}),
    ).resolves.toEqual(UNCORRELATED);
    expect(payments.findByProviderSubscriptionId).not.toHaveBeenCalled();
  });

  it('does not correlate metadata to conflicting Invoice references', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      payment({ providerInvoiceId: 'in_other', providerCustomerId: 'cus_test' }),
    );
    payments.findByProviderInvoiceId.mockResolvedValue(null);
    payments.findByProviderSubscriptionId.mockResolvedValue(null);
    const useCase = new RecordInvoicePaymentFailedUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(UNCORRELATED);
  });
});

const PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CORRELATED = paymentEventResult.completed(
  PaymentEventCompletionCode.PAYMENT_FAILURE_RECORDED,
  PAYMENT_ID,
);
const UNCORRELATED = paymentEventResult.completed(PaymentEventCompletionCode.PAYMENT_FAILURE_RECORDED, null);

function repository() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByProviderInvoiceId: vi.fn().mockResolvedValue(null),
    findByProviderSubscriptionId: vi.fn().mockResolvedValue(null),
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    providerType: PaymentProvider.STRIPE,
    providerPaymentId: 'pi_failed',
    providerSubscriptionId: 'sub_test',
    providerInvoiceId: null,
    providerCustomerId: 'cus_test',
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
      billingReason: overrides.billingReason === undefined ? 'subscription_create' : overrides.billingReason,
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
