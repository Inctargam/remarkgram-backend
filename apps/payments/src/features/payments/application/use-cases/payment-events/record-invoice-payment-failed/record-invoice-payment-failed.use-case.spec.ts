import { describe, expect, it, vi } from 'vitest';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import { Currency } from '../../../../../../common/domain/currency.enum.js';
import { PeriodUnit } from '../../../../../../common/domain/period-unit.enum.js';
import { RenewalPaymentContextUnavailableError } from '../../../errors/renewal-payment-context-unavailable.error.js';
import {
  type Payment,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../../../../domain/payment.entity.js';
import type { InvoicePaymentFailedEvent } from '../../../events/payment-event.js';
import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { EnsureRenewalPaymentUseCase } from '../ensure-renewal-payment/ensure-renewal-payment.use-case.js';
import { PaymentEventCompletionCode, paymentEventResult } from '../payment-event-result.js';
import { RecordInvoicePaymentFailedUseCase } from './record-invoice-payment-failed.use-case.js';

describe('RecordInvoicePaymentFailedUseCase', () => {
  it.each([PaymentStatus.PENDING, PaymentStatus.SUCCEEDED])(
    'correlates an initial %s Payment without changing its lifecycle',
    async (status) => {
      const payments = repository();
      payments.findById.mockResolvedValue(payment({ status }));
      const useCase = createUseCase(payments);

      await expect(useCase.execute(event(), {})).resolves.toEqual(CORRELATED);
    },
  );

  it.each([PaymentStatus.PENDING, PaymentStatus.SUCCEEDED, PaymentStatus.CANCELED])(
    'correlates an existing %s renewal by Invoice without reopening or downgrading it',
    async (status) => {
      const payments = repository();
      payments.findByProviderInvoiceId.mockResolvedValue(payment({ providerInvoiceId: 'in_failed', status }));
      const ensure = renewalEnsurer();
      const useCase = createUseCase(payments, ensure as unknown as EnsureRenewalPaymentUseCase);

      await expect(
        useCase.execute(event({ paymentId: null, billingReason: 'subscription_cycle' }), {}),
      ).resolves.toEqual(CORRELATED);
      expect(payments.findByProviderInvoiceId).toHaveBeenCalledWith(PaymentProvider.STRIPE, 'in_failed', {});
      expect(payments.findByProviderSubscriptionId).not.toHaveBeenCalled();
      expect(ensure.execute).not.toHaveBeenCalled();
    },
  );

  it('recovers a missing renewal through the shared ensure use case without Subscription fallback lookup', async () => {
    const payments = repository();
    payments.findByProviderInvoiceId.mockResolvedValue(null);
    payments.findByProviderSubscriptionId.mockResolvedValue(payment({ providerInvoiceId: null }));
    payments.findById.mockResolvedValue(
      payment({
        type: PaymentType.PURCHASE,
        status: PaymentStatus.SUCCEEDED,
        paidAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
    );
    payments.ensurePendingRenewal.mockResolvedValue(payment());
    const ensure = new EnsureRenewalPaymentUseCase(payments as unknown as PaymentsRepository);
    const useCase = createUseCase(payments, ensure);

    await expect(
      useCase.execute(event({ paymentId: null, billingReason: 'subscription_cycle' }), {}),
    ).resolves.toEqual(CORRELATED);
    expect(payments.findByProviderSubscriptionId).not.toHaveBeenCalled();
    expect(payments.ensurePendingRenewal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        providerInvoiceId: 'in_failed',
        providerSubscriptionId: 'sub_test',
        amount: 1_000,
        currency: Currency.USD,
      }),
      {},
    );
  });

  it('does not correlate metadata to conflicting Invoice references', async () => {
    const payments = repository();
    payments.findById.mockResolvedValue(
      payment({ providerInvoiceId: 'in_other', providerCustomerId: 'cus_test' }),
    );
    payments.findByProviderInvoiceId.mockResolvedValue(null);
    payments.findByProviderSubscriptionId.mockResolvedValue(null);
    const useCase = createUseCase(payments);

    await expect(useCase.execute(event(), {})).resolves.toEqual(UNCORRELATED);
  });

  it('requires reconciliation for a legacy renewal failure without invoice amount and currency', async () => {
    const payments = repository();
    const ensure = new EnsureRenewalPaymentUseCase(payments as unknown as PaymentsRepository);
    const useCase = createUseCase(payments, ensure);
    const current = event({ paymentId: null, billingReason: 'subscription_cycle' });
    const { amount: _amount, currency: _currency, ...legacyPayload } = current.payload;
    const legacy: InvoicePaymentFailedEvent = { ...current, payload: legacyPayload };

    await expect(useCase.execute(legacy, {})).rejects.toMatchObject({
      reason: 'INVOICE_CONTEXT_MISSING',
    } satisfies Partial<RenewalPaymentContextUnavailableError>);
    expect(payments.ensurePendingRenewal).not.toHaveBeenCalled();
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
    ensurePendingRenewal: vi.fn(),
  };
}

function createUseCase(
  payments: ReturnType<typeof repository>,
  ensure: EnsureRenewalPaymentUseCase = renewalEnsurer() as unknown as EnsureRenewalPaymentUseCase,
): RecordInvoicePaymentFailedUseCase {
  return new RecordInvoicePaymentFailedUseCase(payments as unknown as PaymentsRepository, ensure);
}

function renewalEnsurer() {
  return {
    execute: vi
      .fn()
      .mockResolvedValue(
        paymentEventResult.completed(PaymentEventCompletionCode.RENEWAL_ENSURED, PAYMENT_ID),
      ),
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    userId: 42,
    planId: 7,
    amount: 1_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    providerType: PaymentProvider.STRIPE,
    providerPaymentId: 'pi_failed',
    providerSubscriptionId: 'sub_test',
    providerInvoiceId: null,
    providerCustomerId: 'cus_test',
    subscriptionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    type: PaymentType.RENEWAL,
    checkoutPurpose: null,
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
      amount: 1_000,
      currency: 'usd',
      sourcePaymentId: PAYMENT_ID,
      sourceSubscriptionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      providerCode: 'card_declined',
      declineCode: 'insufficient_funds',
      message: 'Your card was declined.',
      failedAt: FAILED_AT,
    },
  };
}

const FAILED_AT = new Date('2026-10-13T12:00:00.000Z');
