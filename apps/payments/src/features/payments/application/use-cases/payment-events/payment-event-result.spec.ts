import { describe, expect, it } from 'vitest';
import { Currency, PeriodUnit } from '../../../../plans/domain/plan.entity.js';
import {
  CheckoutPurpose,
  type Payment,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../../../domain/payment.entity.js';
import {
  PaymentEventResultCode,
  PaymentEventResultStatus,
  paymentEventResult,
} from './payment-event-result.js';

describe('paymentEventResult', () => {
  it('creates the three normalized processing states', () => {
    expect(paymentEventResult.success(PaymentEventResultCode.PAYMENT_CANCELED, 'payment-id')).toEqual({
      status: PaymentEventResultStatus.SUCCESS,
      code: PaymentEventResultCode.PAYMENT_CANCELED,
      paymentId: 'payment-id',
    });
    expect(paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_NOT_FOUND)).toEqual({
      status: PaymentEventResultStatus.IGNORED,
      code: PaymentEventResultCode.PAYMENT_NOT_FOUND,
    });
    expect(paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT)).toEqual({
      status: PaymentEventResultStatus.DEAD,
      code: PaymentEventResultCode.REFERENCE_CONFLICT,
    });
  });

  it('creates the durable continuation payload for a successful Payment', () => {
    const payment = successfulPayment();

    expect(paymentEventResult.successfulPayment(payment)).toEqual({
      status: PaymentEventResultStatus.SUCCESS,
      code: PaymentEventResultCode.PAYMENT_SUCCEEDED,
      paymentId: 'payment-id',
      payment: {
        paymentId: 'payment-id',
        userId: 10,
        planId: 20,
        type: PaymentType.PURCHASE,
        autoRenewalRequested: true,
        amount: 1_000,
        currency: Currency.USD,
        periodCount: 1,
        periodUnit: PeriodUnit.MONTH,
        provider: PaymentProvider.STRIPE,
        providerCustomerId: 'cus_test',
        paidAt: '2026-10-14T10:00:00.000Z',
      },
    });
  });
});

function successfulPayment(): Payment {
  return {
    id: 'payment-id',
    userId: 10,
    planId: 20,
    type: PaymentType.PURCHASE,
    checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
    autoRenewalRequested: true,
    amount: 1_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    providerType: PaymentProvider.STRIPE,
    providerCustomerId: 'cus_test',
    status: PaymentStatus.SUCCEEDED,
    paidAt: new Date('2026-10-14T10:00:00.000Z'),
  } as Payment;
}
