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

describe('ConfirmInvoicePaidUseCase', () => {
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
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(invoiceEvent(), {})).resolves.toEqual({
      outcome: 'SUCCEEDED',
      payment: confirmed,
    });
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
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(invoiceEvent({ paymentId: null }), {})).resolves.toEqual({
      outcome: 'SUCCEEDED',
      payment: confirmed,
    });
    expect(payments.findByProviderInvoiceId).toHaveBeenCalledWith(
      PaymentProvider.STRIPE,
      'in_test',
      {},
    );
  });

  it('rejects subscription_create for a non-initial purchase', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      initialPayment({ checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION }),
    );
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(invoiceEvent(), {})).resolves.toEqual({
      outcome: 'PURPOSE_MISMATCH',
    });
    expect(payments.confirmSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('requires a Subscription reference for subscription_create', async () => {
    const payments = repository();
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository);

    await expect(
      useCase.execute(
        {
          ...invoiceEvent(),
          payload: { ...invoiceEvent().payload, providerSubscriptionId: null },
        },
        {},
      ),
    ).resolves.toEqual({ outcome: 'SUBSCRIPTION_REFERENCE_MISSING' });
    expect(payments.findById).not.toHaveBeenCalled();
  });

  it('creates a successful renewal from a payment with the same Subscription', async () => {
    const payments = repository();
    payments.findByProviderSubscriptionId.mockResolvedValue(initialPayment());
    payments.createSuccessfulRenewal.mockResolvedValue({
      outcome: 'PERSISTED',
      payment: renewalPayment(),
    });
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(invoiceEvent({ billingReason: 'subscription_cycle' }), {})).resolves.toEqual({
      outcome: 'SUCCEEDED',
      payment: renewalPayment(),
    });
    expect(payments.createSuccessfulRenewal).toHaveBeenCalledWith(
      {
        userId: 42,
        planId: 7,
        amount: 10_000,
        currency: Currency.USD,
        periodCount: 1,
        periodUnit: PeriodUnit.MONTH,
        providerType: PaymentProvider.STRIPE,
        providerPaymentId: 'pi_invoice',
        providerSubscriptionId: 'sub_test',
        providerInvoiceId: 'in_test',
        providerCustomerId: 'cus_test',
        subscriptionId: LOCAL_SUBSCRIPTION_ID,
        paidAt: PAID_AT,
      },
      {},
    );
  });

  it('delegates duplicate Invoice handling to the idempotent renewal upsert', async () => {
    const payments = repository();
    payments.findByProviderSubscriptionId.mockResolvedValue(renewalPayment());
    payments.createSuccessfulRenewal.mockResolvedValue({
      outcome: 'PERSISTED',
      payment: renewalPayment(),
    });
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(invoiceEvent({ billingReason: 'subscription_cycle' }), {})).resolves.toEqual({
      outcome: 'SUCCEEDED',
      payment: renewalPayment(),
    });
    expect(payments.createSuccessfulRenewal).toHaveBeenCalledOnce();
  });

  it('does not create a renewal without a local subscriptionId', async () => {
    const payments = repository();
    payments.findByProviderSubscriptionId.mockResolvedValue(initialPayment({ subscriptionId: null }));
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(invoiceEvent({ billingReason: 'subscription_cycle' }), {})).resolves.toEqual({
      outcome: 'SUBSCRIPTION_ID_MISSING',
    });
    expect(payments.createSuccessfulRenewal).not.toHaveBeenCalled();
  });

  it('does not create a renewal when amount reconciliation fails', async () => {
    const payments = repository();
    payments.findByProviderSubscriptionId.mockResolvedValue(initialPayment({ amount: 20_000 }));
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(invoiceEvent({ billingReason: 'subscription_cycle' }), {})).resolves.toEqual({
      outcome: 'AMOUNT_MISMATCH',
    });
    expect(payments.createSuccessfulRenewal).not.toHaveBeenCalled();
  });

  it('rejects unsupported billing reasons before repository access', async () => {
    const payments = repository();
    const useCase = new ConfirmInvoicePaidUseCase(payments as unknown as PaymentsRepository);

    await expect(useCase.execute(invoiceEvent({ billingReason: 'manual' }), {})).resolves.toEqual({
      outcome: 'UNSUPPORTED_BILLING_REASON',
    });
    expect(payments.findById).not.toHaveBeenCalled();
  });
});

const INITIAL_PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RENEWAL_PAYMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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

function renewalPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    ...initialPayment(),
    id: RENEWAL_PAYMENT_ID,
    providerPaymentId: 'pi_invoice',
    providerInvoiceId: 'in_test',
    type: PaymentType.RENEWAL,
    checkoutPurpose: null,
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
      billingReason:
        overrides.billingReason === undefined ? 'subscription_create' : overrides.billingReason,
    },
  };
}
