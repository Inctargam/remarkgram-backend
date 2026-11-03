import type { PaymentsRepository } from '../../../ports/payments.repository.js';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import {
  CheckoutPurpose,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
  type Payment,
} from '../../../../domain/payment.entity.js';
import { Currency, PeriodUnit } from '../../../../../plans/domain/plan.entity.js';
import {
  PaymentEventCompletionCode,
  PaymentEventRejectionReason,
  paymentEventResult,
} from '../payment-event-result.js';
import { PrepareCanceledSubscriptionRenewalUseCase } from './prepare-canceled-subscription-renewal.use-case.js';

describe('PrepareCanceledSubscriptionRenewalUseCase', () => {
  const payments = {
    findPendingRenewalsByProviderSubscriptionId: vi.fn(),
    findByProviderInvoiceId: vi.fn(),
  };
  const useCase = new PrepareCanceledSubscriptionRenewalUseCase(payments as unknown as PaymentsRepository);
  const ctx = {};

  beforeEach(() => vi.clearAllMocks());

  it('requests Invoice void for the matching pending renewal', async () => {
    payments.findByProviderInvoiceId.mockResolvedValue(renewal());

    await expect(useCase.execute(event(), ctx)).resolves.toEqual(
      paymentEventResult.invoiceVoidRequired(PAYMENT_ID, 'in_open'),
    );
  });

  it('completes without provider cleanup when no renewal exists', async () => {
    payments.findPendingRenewalsByProviderSubscriptionId.mockResolvedValue([]);

    await expect(useCase.execute(event({ providerInvoiceId: null }), ctx)).resolves.toEqual(
      paymentEventResult.completed(PaymentEventCompletionCode.SUBSCRIPTION_TERMINATED, null),
    );
  });

  it('retries when a referenced Invoice has not produced its local renewal yet', async () => {
    payments.findByProviderInvoiceId.mockResolvedValue(null);

    await expect(useCase.execute(event(), ctx)).rejects.toMatchObject({
      reason: 'INVOICE_PAYMENT_NOT_FOUND',
    });
  });

  it.each([PaymentStatus.SUCCEEDED, PaymentStatus.FAILED])(
    'does not void an Invoice for a %s renewal',
    async (status) => {
      payments.findPendingRenewalsByProviderSubscriptionId.mockResolvedValue([renewal({ status })]);

      await expect(useCase.execute(event({ providerInvoiceId: null }), ctx)).resolves.toEqual(
        paymentEventResult.completed(PaymentEventCompletionCode.SUBSCRIPTION_TERMINATED, PAYMENT_ID),
      );
    },
  );

  it('is idempotent for an already canceled renewal', async () => {
    payments.findPendingRenewalsByProviderSubscriptionId.mockResolvedValue([
      renewal({ status: PaymentStatus.CANCELED }),
    ]);

    await expect(useCase.execute(event({ providerInvoiceId: null }), ctx)).resolves.toEqual(
      paymentEventResult.completed(PaymentEventCompletionCode.PAYMENT_CANCELED, PAYMENT_ID),
    );
  });

  it.each([
    [{ providerSubscriptionId: 'sub_other' }, {}],
    [{ providerInvoiceId: 'in_other' }, {}],
    [{ providerCustomerId: 'cus_other' }, {}],
  ])('rejects conflicting provider references', async (paymentOverrides, eventOverrides) => {
    payments.findByProviderInvoiceId.mockResolvedValue(renewal(paymentOverrides));

    await expect(useCase.execute(event(eventOverrides), ctx)).resolves.toEqual(
      paymentEventResult.dead(PaymentEventRejectionReason.REFERENCE_CONFLICT),
    );
  });

  it('never treats an initial purchase Invoice as a renewal cleanup candidate', async () => {
    payments.findByProviderInvoiceId.mockResolvedValue(
      renewal({ type: PaymentType.PURCHASE, checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION }),
    );

    await expect(useCase.execute(event(), ctx)).resolves.toEqual(
      paymentEventResult.ignored(PaymentEventRejectionReason.INELIGIBLE_PAYMENT),
    );
  });

  it('requires reconciliation instead of guessing between pending renewals without latest_invoice', async () => {
    payments.findPendingRenewalsByProviderSubscriptionId.mockResolvedValue([
      renewal(),
      renewal({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', providerInvoiceId: 'in_other' }),
    ]);

    await expect(useCase.execute(event({ providerInvoiceId: null }), ctx)).rejects.toMatchObject({
      reason: 'AMBIGUOUS_PENDING_RENEWAL',
    });
  });
});

const PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function event(payload: Record<string, unknown> = {}) {
  return {
    kind: PaymentEventKind.SUBSCRIPTION_DELETED,
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_deleted',
    providerEventType: 'customer.subscription.deleted',
    providerCreatedAt: new Date('2027-01-01T00:00:00.000Z'),
    paymentId: null,
    payload: {
      providerSubscriptionId: 'sub_test',
      providerInvoiceId: 'in_open',
      customerId: 'cus_test',
      status: 'canceled',
      canceledAt: new Date('2027-01-01T00:00:00.000Z'),
      cancellationReason: 'payment_failed',
      ...payload,
    },
  } as const;
}

function renewal(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    userId: 1,
    planId: 1,
    amount: 1_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    providerType: PaymentProvider.STRIPE,
    providerCheckoutId: null,
    providerPaymentId: null,
    providerSubscriptionId: 'sub_test',
    providerInvoiceId: 'in_open',
    providerCustomerId: 'cus_test',
    providerSnapshot: null,
    idempotentKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    autoRenewalRequested: null,
    status: PaymentStatus.PENDING,
    createdAt: new Date('2027-01-01T00:00:00.000Z'),
    paidAt: null,
    checkoutExpiresAt: null,
    type: PaymentType.RENEWAL,
    checkoutPurpose: null,
    ...overrides,
  };
}
