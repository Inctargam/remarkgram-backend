import { ConfirmRenewalPaymentUseCase } from '../confirm-renewal-payment/confirm-renewal-payment.use-case.js';
import { PaymentPersistenceError } from '../../../../../../common/application/errors/payments.error.js';
import { describe, expect, it, vi } from 'vitest';
import { Currency, PeriodUnit } from '../../../../../plans/domain/plan.entity.js';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import {
  CheckoutPurpose,
  type Payment,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../../../../domain/payment.entity.js';
import type { InvoicePaidEvent } from '../../../events/payment-event.js';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { ConfirmInvoicePaidUseCase } from './confirm-invoice-paid.use-case.js';
import { PaymentEventResultCode, paymentEventResult } from '../payment-event-result.js';

describe('ConfirmInvoicePaidUseCase', () => {
  describe.each(['subscription_create'] as const)('concurrent %s confirmation', (billingReason) => {
    const paymentForSlice = initialPayment;

    function setup(latest: Payment | null) {
      const payments = repository();
      const pending = paymentForSlice({ status: PaymentStatus.PENDING, paidAt: null });
      payments.findById.mockResolvedValue(pending);
      payments.findByProviderInvoiceId.mockResolvedValue(pending);
      payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'NOT_UPDATED', payment: latest });
      return { payments, useCase: new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository, new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository)) };
    }

    it('returns compatible success with the original paidAt without another lookup', async () => {
      const confirmed = paymentForSlice({ paidAt: new Date('2026-10-12T11:00:00.000Z') });
      const { payments, useCase } = setup(confirmed);
      await expect(useCase.execute(invoiceEvent({ billingReason }), {}))
        .resolves.toEqual(paymentEventResult.successfulPayment(confirmed));
      expect(payments.findById).toHaveBeenCalledTimes(billingReason === 'subscription_create' ? 1 : 0);
      expect(payments.findByProviderInvoiceId).toHaveBeenCalledTimes(0);
      expect(payments.confirmSuccessfulPayment).toHaveBeenCalledOnce();
    });

    it.each([
      [{ providerPaymentId: 'pi_other' }, PaymentEventResultCode.REFERENCE_CONFLICT],
      [{ providerInvoiceId: 'in_other' }, PaymentEventResultCode.REFERENCE_CONFLICT],
      [{ providerSubscriptionId: 'sub_other' }, PaymentEventResultCode.REFERENCE_CONFLICT],
      [{ providerCustomerId: 'cus_other' }, PaymentEventResultCode.CUSTOMER_MISMATCH],
      [{ amount: 999 }, PaymentEventResultCode.AMOUNT_MISMATCH],
      [{ type: PaymentType.RENEWAL }, PaymentEventResultCode.PURPOSE_MISMATCH],
    ] as const)('reconciles the latest successful Payment before accepting it: %j', async (overrides, code) => {
      const { useCase } = setup(paymentForSlice(overrides));
      await expect(useCase.execute(invoiceEvent({ billingReason }), {}))
        .resolves.toEqual(paymentEventResult.dead(code));
    });

    it('reports a missing Payment', async () => {
      const { useCase } = setup(null);
      await expect(useCase.execute(invoiceEvent({ billingReason }), {}))
        .resolves.toEqual(paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_NOT_FOUND));
    });

    it.each([PaymentStatus.FAILED, PaymentStatus.CANCELED])('preserves terminal state %s', async (status) => {
      const { useCase } = setup(paymentForSlice({ status, paidAt: null }));
      await expect(useCase.execute(invoiceEvent({ billingReason }), {}))
        .resolves.toEqual(paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE));
    });

    it.each([PaymentStatus.CREATED, PaymentStatus.PENDING])('throws a retryable error for unexplained state %s', async (status) => {
      const { useCase } = setup(paymentForSlice({ status, paidAt: null }));
      await expect(useCase.execute(invoiceEvent({ billingReason }), {})).rejects.toBeInstanceOf(PaymentPersistenceError);
    });

    it('rejects success without paidAt', async () => {
      const { useCase } = setup(paymentForSlice({ paidAt: null }));
      await expect(useCase.execute(invoiceEvent({ billingReason }), {})).rejects.toThrow();
    });
  });

  it('confirms an initial purchase correlated by metadata paymentId', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      initialPayment({
        status: PaymentStatus.CREATED,
        paidAt: null,
        providerSubscriptionId: null,
        providerInvoiceId: null,
      }),
    );
    const confirmed = initialPayment();
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'SUCCEEDED', payment: confirmed });
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository, new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository));

    await expect(useCase.execute(invoiceEvent(), {})).resolves.toEqual(
      paymentEventResult.successfulPayment(confirmed),
    );
    expect(payments.confirmSuccessfulPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: INITIAL_PAYMENT_ID,
        providerInvoiceId: 'in_test',
        providerSubscriptionId: 'sub_test',
        paidAt: PAID_AT,
      }),
      {},
    );
  });

  it('falls back from absent metadata to a saved Invoice reference', async () => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(initialPayment());
    const confirmed = initialPayment();
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'SUCCEEDED', payment: confirmed });
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository, new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository));

    await expect(useCase.execute(invoiceEvent({ paymentId: null }), {})).resolves.toEqual(
      paymentEventResult.successfulPayment(confirmed),
    );
    expect(payments.findByProviderInvoiceId).toHaveBeenCalledWith(PaymentProvider.STRIPE, 'in_test', {});
  });

  it('returns SUCCEEDED without mutating an already successful initial purchase', async () => {
    const payments = repository();
    const confirmed = initialPayment({ paidAt: new Date('2026-10-12T11:00:00.000Z') });
    payments.findById.mockResolvedValue(confirmed);
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository, new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository));

    await expect(useCase.execute(invoiceEvent(), {})).resolves.toEqual(
      paymentEventResult.successfulPayment(confirmed),
    );
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('rejects subscription_create for a non-initial purchase', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      initialPayment({ checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION }),
    );
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository, new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository));

    await expect(useCase.execute(invoiceEvent(), {})).resolves.toEqual(
      paymentEventResult.dead(PaymentEventResultCode.PURPOSE_MISMATCH),
    );
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('requires a Subscription reference for subscription_create', async () => {
    const payments = repository();
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository, new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository));

    await expect(
      useCase.execute(
        {
          ...invoiceEvent(),
          payload: { ...invoiceEvent().payload, providerSubscriptionId: null },
        },
        {},
      ),
    ).resolves.toEqual(paymentEventResult.dead(PaymentEventResultCode.SUBSCRIPTION_REFERENCE_MISSING));
    expect(payments.findById).not.toHaveBeenCalled();
  });

  it('delegates subscription_cycle to the renewal use case with the same transaction', async () => {
    const payments = repository();
    const renewal = new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository);
    const expected = paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE);
    const execute = vi.spyOn(renewal, 'execute').mockResolvedValue(expected);
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository, renewal);
    const event = invoiceEvent({ billingReason: 'subscription_cycle' });
    const ctx = {};
    await expect(useCase.execute(event, ctx)).resolves.toEqual(expected);
    expect(execute).toHaveBeenCalledWith(event, ctx);
    expect(payments.findById).not.toHaveBeenCalled();
  });

  it('rejects unsupported billing reasons before repository access', async () => {
    const payments = repository();
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository, new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository));

    await expect(useCase.execute(invoiceEvent({ billingReason: 'manual' }), {})).resolves.toEqual(
      paymentEventResult.dead(PaymentEventResultCode.UNSUPPORTED_BILLING_REASON),
    );
    expect(payments.findById).not.toHaveBeenCalled();
  });
});

const INITIAL_PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOCAL_SUBSCRIPTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PAID_AT = new Date('2026-10-12T12:00:00.000Z');

function repository() {
  return {
    findById: vi.fn(),
    findByProviderInvoiceId: vi.fn(),
    findByProviderSubscriptionId: vi.fn(),
    confirmSuccessfulPayment: vi.fn(),
    createSuccessfulRenewal: vi.fn(),
  };
}

function initialPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: INITIAL_PAYMENT_ID,
    userId: 42,
    planId: 7,
    amount: 10_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    providerType: PaymentProvider.STRIPE,
    providerPaymentId: null,
    providerSubscriptionId: 'sub_test',
    providerInvoiceId: null,
    providerCustomerId: 'cus_test',
    subscriptionId: LOCAL_SUBSCRIPTION_ID,
    status: PaymentStatus.SUCCEEDED,
    paidAt: PAID_AT,
    type: PaymentType.PURCHASE,
    checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
    ...overrides,
  } as Payment;
}

function invoiceEvent(
  overrides: { paymentId?: string | null; billingReason?: string | null } = {},
): InvoicePaidEvent {
  return {
    kind: PaymentEventKind.INVOICE_PAID,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_invoice_paid',
    providerEventType: 'invoice.paid',
    providerCreatedAt: PAID_AT,
    paymentId: overrides.paymentId === undefined ? INITIAL_PAYMENT_ID : overrides.paymentId,
    payload: {
      id: 'in_test',
      customerId: 'cus_test',
      amount: 10_000,
      currency: 'usd',
      paidAt: PAID_AT,
      providerPaymentId: 'pi_invoice',
      providerSubscriptionId: 'sub_test',
      providerInvoiceId: 'in_test',
      billingReason: overrides.billingReason === undefined ? 'subscription_create' : overrides.billingReason,
    },
  };
}
