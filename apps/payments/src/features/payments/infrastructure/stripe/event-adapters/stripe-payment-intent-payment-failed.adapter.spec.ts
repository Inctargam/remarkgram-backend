import { describe, expect, it } from 'vitest';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import { StripePaymentIntentPaymentFailedAdapter } from './stripe-payment-intent-payment-failed.adapter.js';

describe('StripePaymentIntentPaymentFailedAdapter', () => {
  const adapter = new StripePaymentIntentPaymentFailedAdapter();

  it('normalizes only allowlisted failure fields', () => {
    const event = adapter.adapt(webhook());

    expect(event).toEqual({
      kind: PaymentEventKind.PAYMENT_INTENT_PAYMENT_FAILED,
      provider: PaymentProvider.STRIPE,
      providerEventId: 'evt_payment_failed',
      providerEventType: StripeEventType.PAYMENT_INTENT_PAYMENT_FAILED,
      providerCreatedAt: FAILED_AT,
      paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      payload: {
        id: 'pi_test',
        providerCode: 'card_declined',
        declineCode: 'insufficient_funds',
        message: 'Your card was declined. Try another card.',
        failedAt: FAILED_AT,
      },
    });
    expect(JSON.stringify(event)).not.toContain('payment_method');
    expect(JSON.stringify(event)).not.toContain('4242');
  });
});

const FAILED_AT = new Date('2026-10-13T12:00:00.000Z');

function webhook(): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_payment_failed',
    type: StripeEventType.PAYMENT_INTENT_PAYMENT_FAILED,
    createdAt: FAILED_AT,
    payload: {
      id: 'pi_test',
      metadata: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      last_payment_error: {
        code: 'card_declined',
        decline_code: 'insufficient_funds',
        message: 'Your card was declined.\nTry another card.',
        payment_method: { id: 'pm_secret', card: { last4: '4242' } },
      },
    },
    snapshot: { id: 'evt_payment_failed' },
  };
}
