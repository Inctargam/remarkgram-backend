import { describe, expect, it, vi } from 'vitest';
import { PaymentPersistenceError } from '../../../../../../common/application/errors/payments.error.js';
import { Currency } from '../../../../../../common/domain/currency.enum.js';
import { PeriodUnit } from '../../../../../../common/domain/period-unit.enum.js';
import { CheckoutPurpose, PaymentProvider, PaymentStatus, PaymentType, type Payment } from '../../../../domain/payment.entity.js';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import { RenewalPaymentContextUnavailableError } from '../../../errors/renewal-payment-context-unavailable.error.js';
import type { InvoicePaidEvent } from '../../../events/payment-event.js';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { PaymentEventResultCode as Code, paymentEventResult } from '../payment-event-result.js';
import { ConfirmRenewalPaymentUseCase } from './confirm-renewal-payment.use-case.js';

const SOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RENEWAL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUBSCRIPTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PAID_AT = new Date('2026-10-12T12:00:00Z');

function source(overrides: Partial<Payment> = {}): Payment {
  return {
    id: SOURCE_ID, userId: 42, planId: 7, amount: 5000, currency: Currency.USD,
    periodCount: 2, periodUnit: PeriodUnit.MONTH, providerType: PaymentProvider.STRIPE,
    providerPaymentId: 'pi_source', providerInvoiceId: 'in_source',
    providerSubscriptionId: 'sub_test', providerCustomerId: 'cus_test',
    subscriptionId: SUBSCRIPTION_ID, status: PaymentStatus.SUCCEEDED, paidAt: PAID_AT,
    type: PaymentType.PURCHASE, checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
    ...overrides,
  } as Payment;
}
function renewal(overrides: Partial<Payment> = {}): Payment {
  return { ...source(), id: RENEWAL_ID, amount: 10000, type: PaymentType.RENEWAL,
    checkoutPurpose: null, providerInvoiceId: 'in_cycle', providerPaymentId: 'pi_cycle', ...overrides };
}
function event(overrides: Partial<InvoicePaidEvent['payload']> = {}): InvoicePaidEvent {
  return {
    kind: PaymentEventKind.INVOICE_PAID, provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_paid', providerEventType: 'invoice.paid', providerCreatedAt: PAID_AT,
    paymentId: null,
    payload: { id: 'in_cycle', providerInvoiceId: 'in_cycle', providerSubscriptionId: 'sub_test',
      providerPaymentId: 'pi_cycle', customerId: 'cus_test', billingReason: 'subscription_cycle',
      sourcePaymentId: SOURCE_ID, sourceSubscriptionId: SUBSCRIPTION_ID,
      amount: 10000, currency: 'usd', paidAt: PAID_AT, ...overrides },
  };
}
function setup(existing: Payment | null = null) {
  const payments = {
    findByProviderInvoiceId: vi.fn().mockResolvedValue(existing),
    findById: vi.fn().mockResolvedValue(source()),
    findByProviderSubscriptionId: vi.fn(),
    createSuccessfulRenewal: vi.fn().mockResolvedValue({ outcome: 'PERSISTED', payment: renewal() }),
    confirmSuccessfulPayment: vi.fn().mockResolvedValue({ outcome: 'SUCCEEDED', payment: renewal() }),
  };
  return { payments, useCase: new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository) };
}

describe('ConfirmRenewalPaymentUseCase', () => {
  it('uses the exact metadata source for ownership and period, and the Invoice for money', async () => {
    const { payments, useCase } = setup();
    const ctx = {};
    await expect(useCase.execute(event(), ctx)).resolves.toEqual(paymentEventResult.successfulPayment(renewal()));
    expect(payments.findById).toHaveBeenCalledWith(SOURCE_ID, ctx);
    expect(payments.findByProviderSubscriptionId).not.toHaveBeenCalled();
    expect(payments.createSuccessfulRenewal).toHaveBeenCalledWith({
      userId: 42, planId: 7, periodCount: 2, periodUnit: PeriodUnit.MONTH,
      subscriptionId: SUBSCRIPTION_ID, amount: 10000, currency: Currency.USD, paidAt: PAID_AT,
      providerType: PaymentProvider.STRIPE, providerPaymentId: 'pi_cycle', providerInvoiceId: 'in_cycle',
      providerSubscriptionId: 'sub_test', providerCustomerId: 'cus_test',
    }, ctx);
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('replays an existing success without source metadata or overwriting paidAt', async () => {
    const saved = renewal({ paidAt: new Date('2026-10-12T11:00:00Z') });
    const { payments, useCase } = setup(saved);
    await expect(useCase.execute(event({ sourcePaymentId: null, sourceSubscriptionId: null }), {}))
      .resolves.toEqual(paymentEventResult.successfulPayment(saved));
    expect(payments.findById).not.toHaveBeenCalled();
    expect(payments.createSuccessfulRenewal).not.toHaveBeenCalled();
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('confirms an existing pending renewal without resolving the source again', async () => {
    const { payments, useCase } = setup(renewal({ status: PaymentStatus.PENDING, paidAt: null, providerPaymentId: null }));
    await expect(useCase.execute(event(), {})).resolves.toEqual(paymentEventResult.successfulPayment(renewal()));
    expect(payments.findById).not.toHaveBeenCalled();
    expect(payments.confirmSuccessfulPayment).toHaveBeenCalledOnce();
  });

  it('processes PENDING returned by concurrent finalized upsert without recursion or another lookup', async () => {
    const { payments, useCase } = setup();
    payments.createSuccessfulRenewal.mockResolvedValue({ outcome: 'PERSISTED', payment: renewal({ status: PaymentStatus.PENDING, paidAt: null }) });
    await expect(useCase.execute(event(), {})).resolves.toEqual(paymentEventResult.successfulPayment(renewal()));
    expect(payments.findByProviderInvoiceId).toHaveBeenCalledOnce();
    expect(payments.findById).toHaveBeenCalledOnce();
    expect(payments.createSuccessfulRenewal).toHaveBeenCalledOnce();
    expect(payments.confirmSuccessfulPayment).toHaveBeenCalledOnce();
  });

  it.each([
    [{ providerSubscriptionId: null }, Code.SUBSCRIPTION_REFERENCE_MISSING],
    [{ amount: 0 }, Code.AMOUNT_MISMATCH],
    [{ currency: 'eur' }, Code.CURRENCY_MISMATCH],
  ] as const)('rejects invalid Invoice context before writing: %j', async (payload, code) => {
    const { payments, useCase } = setup();
    await expect(useCase.execute(event(payload), {})).resolves.toEqual(paymentEventResult.dead(code));
    expect(payments.createSuccessfulRenewal).not.toHaveBeenCalled();
  });

  it.each([
    [{ type: PaymentType.RENEWAL }, Code.PURPOSE_MISMATCH],
    [{ status: PaymentStatus.PENDING, paidAt: null }, Code.INELIGIBLE_PAYMENT],
    [{ status: PaymentStatus.FAILED, paidAt: null }, Code.INELIGIBLE_PAYMENT],
    [{ status: PaymentStatus.CANCELED, paidAt: null }, Code.INELIGIBLE_PAYMENT],
    [{ paidAt: null }, Code.INELIGIBLE_PAYMENT],
    [{ providerType: 'OTHER' as PaymentProvider }, Code.PROVIDER_MISMATCH],
    [{ providerSubscriptionId: 'sub_other' }, Code.REFERENCE_CONFLICT],
    [{ subscriptionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }, Code.REFERENCE_CONFLICT],
    [{ providerCustomerId: 'cus_other' }, Code.CUSTOMER_MISMATCH],
  ] as const)('rejects an incompatible source without creating a renewal: %j', async (overrides, code) => {
    const { payments, useCase } = setup();
    payments.findById.mockResolvedValue(source(overrides));
    await expect(useCase.execute(event(), {})).resolves.toEqual(paymentEventResult.dead(code));
    expect(payments.createSuccessfulRenewal).not.toHaveBeenCalled();
  });

  it.each(['missing metadata', 'missing source', 'missing local link', 'missing provider link'])('retries unavailable context: %s', async (scenario) => {
    const { payments, useCase } = setup();
    if (scenario === 'missing source') payments.findById.mockResolvedValue(null);
    if (scenario === 'missing local link') payments.findById.mockResolvedValue(source({ subscriptionId: null }));
    if (scenario === 'missing provider link') payments.findById.mockResolvedValue(source({ providerSubscriptionId: null }));
    await expect(useCase.execute(event(scenario === 'missing metadata' ? { sourcePaymentId: null } : {}), {}))
      .rejects.toBeInstanceOf(RenewalPaymentContextUnavailableError);
    expect(payments.createSuccessfulRenewal).not.toHaveBeenCalled();
  });

  it('supports initial Subscription metadata containing only paymentId via its established local binding', async () => {
    const { useCase } = setup();
    await expect(useCase.execute(event({ sourceSubscriptionId: null }), {}))
      .resolves.toEqual(paymentEventResult.successfulPayment(renewal()));
  });

  it('preserves optional Customer knowledge from the source', async () => {
    const { payments, useCase } = setup();
    await useCase.execute(event({ customerId: null }), {});
    expect(payments.createSuccessfulRenewal).toHaveBeenCalledWith(expect.objectContaining({ providerCustomerId: 'cus_test' }), {});
  });

  it.each([
    [{ providerType: 'OTHER' as PaymentProvider }, Code.PROVIDER_MISMATCH],
    [{ userId: 999 }, Code.REFERENCE_CONFLICT],
    [{ planId: 99 }, Code.REFERENCE_CONFLICT],
    [{ periodCount: 9 }, Code.REFERENCE_CONFLICT],
    [{ periodUnit: PeriodUnit.WEEK }, Code.REFERENCE_CONFLICT],
    [{ subscriptionId: null }, Code.SUBSCRIPTION_ID_MISSING],
    [{ providerInvoiceId: 'in_other' }, Code.REFERENCE_CONFLICT],
    [{ providerPaymentId: 'pi_other' }, Code.REFERENCE_CONFLICT],
    [{ amount: 999 }, Code.AMOUNT_MISMATCH],
    [{ currency: 'EUR' as Currency }, Code.CURRENCY_MISMATCH],
  ] as const)('validates the entire context returned by a concurrent upsert: %j', async (overrides, code) => {
    const { payments, useCase } = setup();
    payments.createSuccessfulRenewal.mockResolvedValue({ outcome: 'PERSISTED', payment: renewal(overrides) });
    await expect(useCase.execute(event(), {})).resolves.toEqual(paymentEventResult.dead(code));
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it.each(['create', 'confirm'])('returns a provider reference collision from %s', async (operation) => {
    const { payments, useCase } = setup(operation === 'confirm' ? renewal({ status: PaymentStatus.PENDING, paidAt: null }) : null);
    payments.createSuccessfulRenewal.mockResolvedValue({ outcome: 'REFERENCE_CONFLICT' });
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'REFERENCE_CONFLICT' });
    await expect(useCase.execute(event(), {})).resolves.toEqual(paymentEventResult.dead(Code.REFERENCE_CONFLICT));
  });

  it.each([
    [renewal({ paidAt: new Date('2026-10-12T11:00:00Z') }), 'success'],
    [renewal({ providerPaymentId: 'pi_other' }), 'conflict'],
    [renewal({ status: PaymentStatus.CANCELED, paidAt: null }), 'terminal'],
    [renewal({ status: PaymentStatus.FAILED, paidAt: null }), 'terminal'],
  ] as const)('classifies the reread Payment after a concurrent change: %s', async (latest, outcome) => {
    const { payments, useCase } = setup(renewal({ status: PaymentStatus.PENDING, paidAt: null }));
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'NOT_UPDATED', payment: latest });
    const expected = outcome === 'success' ? paymentEventResult.successfulPayment(latest)
      : outcome === 'conflict' ? paymentEventResult.dead(Code.REFERENCE_CONFLICT)
        : paymentEventResult.ignored(Code.PAYMENT_TERMINAL_STATE);
    await expect(useCase.execute(event(), {})).resolves.toEqual(expected);
    expect(payments.confirmSuccessfulPayment).toHaveBeenCalledOnce();
    expect(payments.findByProviderInvoiceId).toHaveBeenCalledOnce();
  });

  it.each([null, renewal({ status: PaymentStatus.CREATED, paidAt: null }), renewal({ status: PaymentStatus.PENDING, paidAt: null })])
    ('throws an application error for unexplained NOT_UPDATED state %j', async (latest) => {
      const { payments, useCase } = setup(renewal({ status: PaymentStatus.PENDING, paidAt: null }));
      payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'NOT_UPDATED', payment: latest });
      await expect(useCase.execute(event(), {})).rejects.toBeInstanceOf(latest ? PaymentPersistenceError : RenewalPaymentContextUnavailableError);
      expect(payments.confirmSuccessfulPayment).toHaveBeenCalledOnce();
    });

  it.each([PaymentStatus.FAILED, PaymentStatus.CANCELED])('does not mutate an existing terminal %s Payment', async (status) => {
    const { payments, useCase } = setup(renewal({ status, paidAt: null }));
    await expect(useCase.execute(event(), {})).resolves.toEqual(paymentEventResult.ignored(Code.PAYMENT_TERMINAL_STATE));
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('rejects an existing purchase and a successful renewal without paidAt', async () => {
    const purchase = setup(source());
    await expect(purchase.useCase.execute(event(), {})).resolves.toEqual(paymentEventResult.dead(Code.PURPOSE_MISMATCH));
    const invalid = setup(renewal({ paidAt: null }));
    await expect(invalid.useCase.execute(event(), {})).rejects.toThrow();
  });

  it('propagates database failures to the workflow', async () => {
    const { payments, useCase } = setup();
    const error = new Error('database unavailable');
    payments.createSuccessfulRenewal.mockRejectedValue(error);
    await expect(useCase.execute(event(), {})).rejects.toBe(error);
  });
});
