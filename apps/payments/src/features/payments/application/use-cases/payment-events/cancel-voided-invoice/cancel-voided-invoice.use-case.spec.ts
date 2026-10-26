import { describe, expect, it, vi } from 'vitest';
import type { InvoiceVoidedEvent } from '../../../events/payment-event.js';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import { type Payment, PaymentProvider, PaymentStatus, PaymentType } from '../../../../domain/payment.entity.js';
import { PaymentEventResultCode, paymentEventResult } from '../payment-event-result.js';
import { CancelVoidedInvoiceUseCase } from './cancel-voided-invoice.use-case.js';

describe('CancelVoidedInvoiceUseCase', () => {
  it.each([PaymentStatus.CREATED, PaymentStatus.PENDING])('cancels a renewal in %s by Invoice ID', async (status) => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(payment({ status }));
    payments.cancelPendingPayment.mockResolvedValue({ outcome: 'CANCELED' });
    const useCase = new CancelVoidedInvoiceUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(CANCELED);
    expect(payments.findById).not.toHaveBeenCalled();
    expect(payments.cancelPendingPayment).toHaveBeenCalledWith({
      paymentId: RENEWAL_ID,
      providerInvoiceId: 'in_voided',
      providerCustomerId: 'cus_test',
    }, {});
  });

  it('requests a retry when finalized has not created the renewal yet', async () => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(null);
    const useCase = new CancelVoidedInvoiceUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).rejects.toMatchObject({
      reason: 'INVOICE_PAYMENT_NOT_FOUND',
      providerInvoiceId: 'in_voided',
    });
  });

  it('handles an already canceled renewal idempotently', async () => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(payment({ status: PaymentStatus.CANCELED }));
    const useCase = new CancelVoidedInvoiceUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(CANCELED);
    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it.each([PaymentStatus.SUCCEEDED, PaymentStatus.FAILED])('does not downgrade %s', async (status) => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(payment({ status }));
    const useCase = new CancelVoidedInvoiceUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE),
    );
    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it('ignores non-cycle Invoices before repository lookup', async () => {
    const payments = repository();
    const useCase = new CancelVoidedInvoiceUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event({ billingReason: 'subscription_create' }), {})).resolves.toEqual(
      paymentEventResult.ignored(PaymentEventResultCode.UNSUPPORTED_BILLING_REASON),
    );
    expect(payments.findByProviderInvoiceId).not.toHaveBeenCalled();
  });

  it('rejects conflicting references without mutation', async () => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(payment({ providerSubscriptionId: 'sub_other' }));
    const useCase = new CancelVoidedInvoiceUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT),
    );
    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
  });
});

function repository() {
  return { findByProviderInvoiceId: vi.fn(), findById: vi.fn(), cancelPendingPayment: vi.fn() };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: RENEWAL_ID,
    type: PaymentType.RENEWAL,
    checkoutPurpose: null,
    providerType: PaymentProvider.STRIPE,
    providerInvoiceId: 'in_voided',
    providerSubscriptionId: 'sub_test',
    providerCustomerId: 'cus_test',
    status: PaymentStatus.PENDING,
    ...overrides,
  } as Payment;
}

function event(payload: Partial<InvoiceVoidedEvent['payload']> = {}): InvoiceVoidedEvent {
  return {
    kind: PaymentEventKind.INVOICE_VOIDED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_voided',
    providerEventType: 'invoice.voided',
    providerCreatedAt: new Date('2026-10-26T12:00:00.000Z'),
    paymentId: null,
    payload: {
      providerInvoiceId: 'in_voided',
      providerSubscriptionId: 'sub_test',
      customerId: 'cus_test',
      billingReason: 'subscription_cycle',
      sourcePaymentId: SOURCE_PAYMENT_ID,
      ...payload,
    },
  };
}

const RENEWAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SOURCE_PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CANCELED = paymentEventResult.success(PaymentEventResultCode.PAYMENT_CANCELED, RENEWAL_ID);
