import { RenewalPaymentContextUnavailableError } from '../../../errors/renewal-payment-context-unavailable.error.js';
import { describe, expect, it, vi } from 'vitest';
import { Currency } from '../../../../../../common/domain/currency.enum.js';
import { PeriodUnit } from '../../../../../../common/domain/period-unit.enum.js';
import { PaymentProvider, PaymentStatus, PaymentType, type Payment } from '../../../../domain/payment.entity.js';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import type { InvoiceFinalizedEvent } from '../../../events/payment-event.js';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { PaymentEventResultCode, paymentEventResult } from '../payment-event-result.js';
import { EnsureRenewalPaymentUseCase } from './ensure-renewal-payment.use-case.js';

function payment(overrides: Partial<Payment> = {}): Payment {
  return { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userId: 1, planId: 2,
    amount: 1000, currency: Currency.USD, periodCount: 1, periodUnit: PeriodUnit.MONTH,
    providerType: PaymentProvider.STRIPE, providerSubscriptionId: 'sub_test', providerCustomerId: 'cus_test',
    providerInvoiceId: 'in_cycle', providerPaymentId: null, subscriptionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    type: PaymentType.RENEWAL, checkoutPurpose: null, status: PaymentStatus.PENDING, paidAt: null, ...overrides } as Payment;
}
function event(overrides: Partial<InvoiceFinalizedEvent['payload']> = {}): InvoiceFinalizedEvent {
  return { provider: PaymentProvider.STRIPE, providerEventId: 'evt_finalized', providerEventType: 'invoice.finalized',
    providerCreatedAt: new Date('2026-10-22T00:00:00Z'), paymentId: null, kind: PaymentEventKind.INVOICE_FINALIZED,
    payload: { providerInvoiceId: 'in_cycle', providerSubscriptionId: 'sub_test', customerId: 'cus_test',
      billingReason: 'subscription_cycle', amount: 1000, currency: 'usd',
      sourcePaymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceSubscriptionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ...overrides } };
}
function setup() {
  const payments = { findByProviderInvoiceId: vi.fn().mockResolvedValue(null),
    findByProviderSubscriptionId: vi.fn(),
    findById: vi.fn().mockResolvedValue(payment({ type: PaymentType.PURCHASE, status: PaymentStatus.SUCCEEDED, paidAt: new Date('2026-10-21T00:00:00Z'), amount: 5000 })),
    ensurePendingRenewal: vi.fn().mockResolvedValue(payment()) };
  return { payments, useCase: new EnsureRenewalPaymentUseCase(payments as unknown as PaymentsRepository) };
}
describe('EnsureRenewalPaymentUseCase', () => {
  it('ensures a pending invoice without paid/PaymentIntent fields', async () => {
    const { payments, useCase } = setup();
    await useCase.execute(event(), {});
    const first = payments.ensurePendingRenewal.mock.calls[0]![0];
    expect(first).not.toHaveProperty('idempotentKey');
    expect(first).not.toHaveProperty('paidAt');
    expect(first).not.toHaveProperty('providerPaymentId');
  });
  it.each([PaymentStatus.PENDING, PaymentStatus.SUCCEEDED, PaymentStatus.CANCELED])
    ('does not overwrite an existing %s renewal or invoke the subscription success step', async (status) => {
      const { payments, useCase } = setup();
      payments.findByProviderInvoiceId.mockResolvedValue(payment({ status }));
      expect(await useCase.execute(event(), {})).toEqual(paymentEventResult.success(PaymentEventResultCode.RENEWAL_ENSURED, payment().id));
      expect(payments.ensurePendingRenewal).not.toHaveBeenCalled();
      expect(payments.findByProviderSubscriptionId).not.toHaveBeenCalled();
    });
  it.each([
    [{ amount: 0 }, PaymentEventResultCode.AMOUNT_MISMATCH],
    [{ currency: 'eur' }, PaymentEventResultCode.CURRENCY_MISMATCH],
    [{ customerId: 'cus_other' }, PaymentEventResultCode.CUSTOMER_MISMATCH],
    [{ providerSubscriptionId: null }, PaymentEventResultCode.SUBSCRIPTION_REFERENCE_MISSING],
  ] as const)('rejects inconsistent context %j before writing', async (payload, code) => {
    const { payments, useCase } = setup();
    expect(await useCase.execute(event(payload), {})).toEqual(paymentEventResult.dead(code));
    expect(payments.ensurePendingRenewal).not.toHaveBeenCalled();
  });
  it('does not create initial-purchase payments', async () => {
    const { payments, useCase } = setup();
    expect(await useCase.execute(event({ billingReason: 'subscription_create' }), {}))
      .toEqual(paymentEventResult.ignored(PaymentEventResultCode.UNSUPPORTED_BILLING_REASON));
    expect(payments.ensurePendingRenewal).not.toHaveBeenCalled();
  });
  it('requires a linked local subscription', async () => {
    const { payments, useCase } = setup();
    payments.findById.mockResolvedValue(payment({ type: PaymentType.PURCHASE, status: PaymentStatus.SUCCEEDED, paidAt: new Date(), subscriptionId: null }));
    await expect(useCase.execute(event(), {})).rejects.toBeInstanceOf(RenewalPaymentContextUnavailableError);
    expect(payments.ensurePendingRenewal).not.toHaveBeenCalled();
  });
  it('uses metadata source identity and takes the new amount from finalized, not the purchase', async () => {
    const { payments, useCase } = setup();
    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.success(PaymentEventResultCode.RENEWAL_ENSURED, payment().id),
    );
    expect(payments.findById).toHaveBeenCalledWith(event().payload.sourcePaymentId, {});
    expect(payments.findByProviderSubscriptionId).not.toHaveBeenCalled();
    expect(payments.ensurePendingRenewal).toHaveBeenCalledWith(expect.objectContaining({ amount: 1000, currency: Currency.USD }), {});
  });

  it.each([null, undefined])('retries missing source metadata: %s', async (sourcePaymentId) => {
    const { payments, useCase } = setup();
    await expect(useCase.execute(event({ sourcePaymentId }), {})).rejects.toBeInstanceOf(RenewalPaymentContextUnavailableError);
    expect(payments.findByProviderSubscriptionId).not.toHaveBeenCalled();
    expect(payments.ensurePendingRenewal).not.toHaveBeenCalled();
  });

  it('retries a source that is not found locally', async () => {
    const { payments, useCase } = setup();
    payments.findById.mockResolvedValue(null);
    await expect(useCase.execute(event(), {})).rejects.toBeInstanceOf(RenewalPaymentContextUnavailableError);
  });

  it.each(['userId', 'planId', 'periodCount'] as const)('rejects concurrent upsert with different %s', async (field) => {
    const { payments, useCase } = setup();
    payments.ensurePendingRenewal.mockResolvedValue(payment({ [field]: 999 }));
    await expect(useCase.execute(event(), {})).resolves.toEqual(paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT));
  });

  it('does not compare late finalized amount_due with an already collected amount', async () => {
    const { payments, useCase } = setup();
    payments.findByProviderInvoiceId.mockResolvedValue(payment({ status: PaymentStatus.SUCCEEDED, paidAt: new Date(), amount: 900 }));
    await expect(useCase.execute(event(), {})).resolves.toEqual(
      paymentEventResult.success(PaymentEventResultCode.RENEWAL_ENSURED, payment().id),
    );
    expect(payments.ensurePendingRenewal).not.toHaveBeenCalled();
  });

  it('accepts missing optional customer knowledge', async () => {
    const { payments, useCase } = setup();
    await useCase.execute(event({ customerId: null }), {});
    expect(payments.ensurePendingRenewal).toHaveBeenCalledWith(expect.objectContaining({ providerCustomerId: 'cus_test' }), {});
  });
});
