import { ConfirmRenewalPaymentUseCase } from '../confirm-renewal-payment/confirm-renewal-payment.use-case.js';
import { PaymentConfirmationNotAppliedError } from '../../../errors/payment-confirmation-not-applied.error.js';
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
import { PaymentEventRejectionReason, paymentEventResult } from '../payment-event-result.js';

describe('ConfirmInvoicePaidUseCase', () => {
  it.each([
    [initialPayment({ paidAt: new Date('2026-10-12T11:00:00.000Z') }), 'confirmed'],
    [initialPayment({ providerInvoiceId: 'in_other' }), 'conflict'],
    [initialPayment({ status: PaymentStatus.CANCELED, paidAt: null }), 'terminal'],
    [null, 'missing'],
  ] as const)(
    'reconciles the next initial-purchase attempt after NOT_UPDATED: %s',
    async (latest, outcome) => {
      const payments = repository();
      payments.findById
        .mockResolvedValueOnce(initialPayment({ status: PaymentStatus.PENDING, paidAt: null }))
        .mockResolvedValueOnce(latest);
      payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'NOT_UPDATED' });
      const useCase = new ConfirmInvoicePaidUseCase(
        payments as unknown as PaymentsRepository,
        new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository),
      );
      const event = invoiceEvent({ billingReason: 'subscription_create' });

      await expect(useCase.execute(event, {})).rejects.toBeInstanceOf(PaymentConfirmationNotAppliedError);
      const expected =
        outcome === 'confirmed'
          ? paymentEventResult.paymentConfirmed(latest)
          : outcome === 'conflict'
            ? paymentEventResult.dead(PaymentEventRejectionReason.REFERENCE_CONFLICT)
            : paymentEventResult.ignored(
                outcome === 'missing'
                  ? PaymentEventRejectionReason.PAYMENT_NOT_FOUND
                  : PaymentEventRejectionReason.PAYMENT_TERMINAL_STATE,
              );
      await expect(useCase.execute(event, {})).resolves.toEqual(expected);
      expect(payments.confirmSuccessfulPayment).toHaveBeenCalledOnce();
      expect(payments.findById).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    [{ providerPaymentId: 'pi_other' }, PaymentEventRejectionReason.REFERENCE_CONFLICT],
    [{ providerSubscriptionId: 'sub_other' }, PaymentEventRejectionReason.REFERENCE_CONFLICT],
    [{ providerCustomerId: 'cus_other' }, PaymentEventRejectionReason.CUSTOMER_MISMATCH],
    [{ amount: 999 }, PaymentEventRejectionReason.AMOUNT_MISMATCH],
    [{ type: PaymentType.RENEWAL }, PaymentEventRejectionReason.PURPOSE_MISMATCH],
  ] as const)('validates the current initial Payment on retry: %j', async (overrides, reason) => {
    const payments = repository();
    payments.findById
      .mockResolvedValueOnce(initialPayment({ status: PaymentStatus.PENDING, paidAt: null }))
      .mockResolvedValueOnce(initialPayment(overrides));
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'NOT_UPDATED' });
    const useCase = new ConfirmInvoicePaidUseCase(
      payments as unknown as PaymentsRepository,
      new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository),
    );
    await expect(useCase.execute(invoiceEvent(), {})).rejects.toBeInstanceOf(
      PaymentConfirmationNotAppliedError,
    );
    await expect(useCase.execute(invoiceEvent(), {})).resolves.toEqual(paymentEventResult.dead(reason));
    expect(payments.confirmSuccessfulPayment).toHaveBeenCalledOnce();
  });

  it('rejects an initial Payment without paidAt when success is read on retry', async () => {
    const payments = repository();
    payments.findById
      .mockResolvedValueOnce(initialPayment({ status: PaymentStatus.PENDING, paidAt: null }))
      .mockResolvedValueOnce(initialPayment({ paidAt: null }));
    payments.confirmSuccessfulPayment.mockResolvedValue({ outcome: 'NOT_UPDATED' });
    const useCase = new ConfirmInvoicePaidUseCase(
      payments as unknown as PaymentsRepository,
      new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository),
    );
    await expect(useCase.execute(invoiceEvent(), {})).rejects.toBeInstanceOf(
      PaymentConfirmationNotAppliedError,
    );
    await expect(useCase.execute(invoiceEvent(), {})).rejects.toThrow();
    expect(payments.confirmSuccessfulPayment).toHaveBeenCalledOnce();
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
    const useCase = new ConfirmInvoicePaidUseCase(
      payments as unknown as PaymentsRepository,
      new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository),
    );

    await expect(useCase.execute(invoiceEvent(), {})).resolves.toEqual(
      paymentEventResult.paymentConfirmed(confirmed),
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
    const useCase = new ConfirmInvoicePaidUseCase(
      payments as unknown as PaymentsRepository,
      new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository),
    );

    await expect(useCase.execute(invoiceEvent({ paymentId: null }), {})).resolves.toEqual(
      paymentEventResult.paymentConfirmed(confirmed),
    );
    expect(payments.findByProviderInvoiceId).toHaveBeenCalledWith(PaymentProvider.STRIPE, 'in_test', {});
  });

  it('returns SUCCEEDED without mutating an already successful initial purchase', async () => {
    const payments = repository();
    const confirmed = initialPayment({ paidAt: new Date('2026-10-12T11:00:00.000Z') });
    payments.findById.mockResolvedValue(confirmed);
    const useCase = new ConfirmInvoicePaidUseCase(
      payments as unknown as PaymentsRepository,
      new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository),
    );

    await expect(useCase.execute(invoiceEvent(), {})).resolves.toEqual(
      paymentEventResult.paymentConfirmed(confirmed),
    );
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('rejects subscription_create for a non-initial purchase', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      initialPayment({ checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION }),
    );
    const useCase = new ConfirmInvoicePaidUseCase(
      payments as unknown as PaymentsRepository,
      new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository),
    );

    await expect(useCase.execute(invoiceEvent(), {})).resolves.toEqual(
      paymentEventResult.dead(PaymentEventRejectionReason.PURPOSE_MISMATCH),
    );
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('requires a Subscription reference for subscription_create', async () => {
    const payments = repository();
    const useCase = new ConfirmInvoicePaidUseCase(
      payments as unknown as PaymentsRepository,
      new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository),
    );

    await expect(
      useCase.execute(
        {
          ...invoiceEvent(),
          payload: { ...invoiceEvent().payload, providerSubscriptionId: null },
        },
        {},
      ),
    ).resolves.toEqual(paymentEventResult.dead(PaymentEventRejectionReason.SUBSCRIPTION_REFERENCE_MISSING));
    expect(payments.findById).not.toHaveBeenCalled();
  });

  it('delegates subscription_cycle to the renewal use case with the same transaction', async () => {
    const payments = repository();
    const renewal = new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository);
    const expected = paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_TERMINAL_STATE);
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
    const useCase = new ConfirmInvoicePaidUseCase(
      payments as unknown as PaymentsRepository,
      new ConfirmRenewalPaymentUseCase(payments as unknown as PaymentsRepository),
    );

    await expect(useCase.execute(invoiceEvent({ billingReason: 'manual' }), {})).resolves.toEqual(
      paymentEventResult.dead(PaymentEventRejectionReason.UNSUPPORTED_BILLING_REASON),
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
    ensurePendingRenewal: vi.fn(),
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
