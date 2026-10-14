import { describe, expect, it, vi } from 'vitest';
import { Currency, PeriodUnit } from '../../../plans/domain/plan.entity.js';
import type { PaymentsRepository } from '../../application/ports/payments.repository.js';
import type { SuccessfulPayment } from '../../application/types/successful-payment.types.js';
import { CheckoutPurpose, PaymentProvider, PaymentType } from '../../domain/payment.entity.js';
import { TemporarySubscriptionPaymentHandlerAdapter } from './temporary-subscription-payment-handler.adapter.js';

describe('TemporarySubscriptionPaymentHandlerAdapter', () => {
  it('generates a Subscription UUID and a calendar paidUntil for the first purchase', async () => {
    const payments = {
      findById: vi.fn<PaymentsRepository['findById']>().mockResolvedValue(null),
    };
    const adapter = new TemporarySubscriptionPaymentHandlerAdapter(
      payments as unknown as PaymentsRepository,
    );

    await expect(adapter.applySuccessfulPayment(successfulPayment(), {})).resolves.toMatchObject({
      subscriptionId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      action: 'CREATED',
      paidUntil: '2026-02-28T10:00:00.000Z',
      previousProviderSubscriptionId: null,
    });
  });
});

function successfulPayment(): SuccessfulPayment {
  return {
    paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: 10,
    planId: 20,
    type: PaymentType.PURCHASE,
    checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
    autoRenewalRequested: true,
    amount: 1_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    provider: PaymentProvider.STRIPE,
    providerCustomerId: 'cus_test',
    paidAt: '2026-01-31T10:00:00.000Z',
  };
}
