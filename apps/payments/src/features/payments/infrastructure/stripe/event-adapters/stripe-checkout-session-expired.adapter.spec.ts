import { describe, expect, it } from 'vitest';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeCheckoutSessionExpiredAdapter } from './stripe-checkout-session-expired.adapter.js';
import { StripeEventType } from './stripe-event-type.js';

describe('StripeCheckoutSessionExpiredAdapter', () => {
  it('normalizes checkout.session.expired', () => {
    const adapter = new StripeCheckoutSessionExpiredAdapter();

    expect(adapter.adapt(webhook())).toMatchObject({
      kind: PaymentEventKind.CHECKOUT_SESSION_EXPIRED,
      paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      payload: {
        id: 'cs_expired',
        customerId: 'cus_test',
        mode: 'payment',
        amount: 10_000,
        currency: 'usd',
      },
    });
  });
});

function webhook(): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_expired',
    type: StripeEventType.CHECKOUT_SESSION_EXPIRED,
    createdAt: new Date('2026-10-14T12:00:00.000Z'),
    payload: {
      id: 'cs_expired',
      customer: 'cus_test',
      mode: 'payment',
      amount_total: 10_000,
      currency: 'usd',
      metadata: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    },
    snapshot: { id: 'evt_expired' },
  };
}
