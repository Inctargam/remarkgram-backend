import { describe, expect, it } from 'vitest';
import { Currency, PeriodUnit } from '../../../../plans/domain/plan.entity.js';
import {
  CheckoutPurpose,
  Payment,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
  type RestorePaymentProps,
} from '../../../domain/payment.entity.js';
import { InvalidPaymentStateError } from '../../../domain/errors/payment-validation.errors.js';
import { createSuccessfulPayment } from './successful-payment.factory.js';

describe('createSuccessfulPayment workflow DTO factory', () => {
  it('maps a committed purchase to a serializable snapshot', () => {
    expect(createSuccessfulPayment(payment())).toEqual({
      paymentId: PAYMENT_ID,
      userId: 10,
      planId: 20,
      type: PaymentType.PURCHASE,
      autoRenewalRequested: true,
      targetSubscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      amount: 1_500,
      currency: Currency.USD,
      periodCount: 2,
      periodUnit: PeriodUnit.MONTH,
      provider: PaymentProvider.STRIPE,
      providerCustomerId: 'cus_test',
      providerSubscriptionId: null,
      paidAt: '2026-10-14T09:30:00.000Z',
    });
  });

  it('preserves nullable purchase context for a renewal', () => {
    const renewal = payment({
      type: PaymentType.RENEWAL,
      checkoutPurpose: null,
      autoRenewalRequested: null,
      targetSubscriptionId: null,
      providerCheckoutId: null,
      providerInvoiceId: 'in_test',
      subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });

    expect(createSuccessfulPayment(renewal)).toEqual(
      expect.objectContaining({
        type: PaymentType.RENEWAL,
        autoRenewalRequested: null,
        targetSubscriptionId: null,
      }),
    );
  });

  it('includes the provider subscription binding for an initial purchase', () => {
    const initial = payment({
      checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
      targetSubscriptionId: null,
      providerSubscriptionId: 'sub_initial',
    });

    expect(createSuccessfulPayment(initial).providerSubscriptionId).toBe('sub_initial');
  });

  it('rejects a Payment whose success has not been committed', () => {
    const pending = payment({ status: PaymentStatus.PENDING, paidAt: null });

    expect(() => createSuccessfulPayment(pending)).toThrow(InvalidPaymentStateError);
  });
});

const PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function payment(overrides: Partial<RestorePaymentProps> = {}): Payment {
  return Payment.restore({
    id: PAYMENT_ID,
    userId: 10,
    planId: 20,
    amount: 1_500,
    currency: Currency.USD,
    periodCount: 2,
    periodUnit: PeriodUnit.MONTH,
    providerType: PaymentProvider.STRIPE,
    idempotentKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    providerCheckoutId: 'cs_test',
    providerPaymentId: 'pi_test',
    providerSubscriptionId: null,
    providerInvoiceId: null,
    providerCustomerId: 'cus_test',
    checkoutExpiresAt: new Date('2026-10-14T10:00:00.000Z'),
    providerSnapshot: null,
    subscriptionId: null,
    targetSubscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    status: PaymentStatus.SUCCEEDED,
    createdAt: new Date('2026-10-14T09:00:00.000Z'),
    paidAt: new Date('2026-10-14T09:30:00.000Z'),
    checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
    autoRenewalRequested: true,
    type: PaymentType.PURCHASE,
    ...overrides,
  });
}
