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
  PaymentEventCompletionCode,
  PaymentEventRejectionReason,
  PaymentEventOutcome,
  PaymentEventRejectionDisposition,
  paymentEventResult,
} from './payment-event-result.js';

describe('paymentEventResult', () => {
  it('separates completed processing from rejected events and their disposition', () => {
    expect(paymentEventResult.completed(PaymentEventCompletionCode.PAYMENT_CANCELED, 'payment-id')).toEqual({
      outcome: PaymentEventOutcome.COMPLETED,
      code: PaymentEventCompletionCode.PAYMENT_CANCELED,
      paymentId: 'payment-id',
    });
    expect(paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_NOT_FOUND)).toEqual({
      outcome: PaymentEventOutcome.REJECTED,
      disposition: PaymentEventRejectionDisposition.IGNORED,
      reason: PaymentEventRejectionReason.PAYMENT_NOT_FOUND,
    });
    expect(paymentEventResult.dead(PaymentEventRejectionReason.REFERENCE_CONFLICT)).toEqual({
      outcome: PaymentEventOutcome.REJECTED,
      disposition: PaymentEventRejectionDisposition.DEAD,
      reason: PaymentEventRejectionReason.REFERENCE_CONFLICT,
    });
  });

  it('creates the durable continuation payload for a successful Payment', () => {
    const payment = successfulPayment();

    expect(paymentEventResult.paymentConfirmed(payment)).toEqual({
      outcome: PaymentEventOutcome.PAYMENT_CONFIRMED,
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
