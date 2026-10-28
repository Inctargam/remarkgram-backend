import { describe, expect, it } from 'vitest';
import {
  PaymentEventCompletionCode,
  PaymentEventOutcome,
  PaymentEventRejectionDisposition,
  PaymentEventRejectionReason,
} from '../../application/use-cases/payment-events/payment-event-result.js';
import type { SuccessfulPayment } from '../../application/types/successful-payment.types.js';
import { mapPaymentEventHistoryResult } from './payment-event-history-result.mapper.js';

describe('mapPaymentEventHistoryResult', () => {
  it('preserves continuation for a payment confirmation restored from legacy history', () => {
    const payment = { paymentId: 'payment-id' } as SuccessfulPayment;
    expect(
      mapPaymentEventHistoryResult({
        status: 'SUCCESS',
        code: 'PAYMENT_SUCCEEDED',
        paymentId: payment.paymentId,
        payment,
      }),
    ).toEqual({ outcome: PaymentEventOutcome.PAYMENT_CONFIRMED, payment });
  });

  it('restores completed processing without requesting access application', () => {
    expect(
      mapPaymentEventHistoryResult({
        status: 'SUCCESS',
        code: PaymentEventCompletionCode.RENEWAL_ENSURED,
        paymentId: 'payment-id',
      }),
    ).toEqual({
      outcome: PaymentEventOutcome.COMPLETED,
      code: PaymentEventCompletionCode.RENEWAL_ENSURED,
      paymentId: 'payment-id',
    });
  });

  it.each(['IGNORED', 'DEAD'] as const)('preserves the legacy %s audit disposition', (status) => {
    expect(
      mapPaymentEventHistoryResult({ status, code: PaymentEventRejectionReason.PAYMENT_NOT_FOUND }),
    ).toEqual({
      outcome: PaymentEventOutcome.REJECTED,
      disposition:
        status === 'IGNORED'
          ? PaymentEventRejectionDisposition.IGNORED
          : PaymentEventRejectionDisposition.DEAD,
      reason: PaymentEventRejectionReason.PAYMENT_NOT_FOUND,
    });
  });

  it('returns a current result without changing it', () => {
    const result = {
      outcome: PaymentEventOutcome.COMPLETED as const,
      code: PaymentEventCompletionCode.CHECKOUT_COMPLETED,
      paymentId: null,
    };
    expect(mapPaymentEventHistoryResult(result)).toBe(result);
  });
});
