import { describe, expect, it } from 'vitest';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeInvoiceFinalizedAdapter } from './stripe-invoice-finalized.adapter.js';

const adapter = new StripeInvoiceFinalizedAdapter();
function webhook(payload: Record<string, unknown> = {}): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_finalized',
    type: 'invoice.finalized',
    createdAt: new Date('2026-10-22T00:00:00Z'),
    snapshot: {},
    payload: {
      id: 'in_cycle',
      amount_due: 1000,
      amount_paid: 0,
      currency: 'usd',
      billing_reason: 'subscription_cycle',
      customer: { id: 'cus_test' },
      parent: {
        subscription_details: {
          subscription: 'sub_test',
          metadata: {
            paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          },
        },
      },
      ...payload,
    },
  };
}
describe('StripeInvoiceFinalizedAdapter', () => {
  it('uses amount_due and correlates the event with Payment metadata', () => {
    const event = adapter.adapt(webhook());
    expect(event.paymentId).toBeNull();
    expect(event.payload).toEqual({
      providerInvoiceId: 'in_cycle',
      amount: 1000,
      currency: 'usd',
      billingReason: 'subscription_cycle',
      customerId: 'cus_test',
      providerSubscriptionId: 'sub_test',
      sourcePaymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceSubscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(event.payload).not.toHaveProperty('providerPaymentId');
  });
  it('extracts metadata references independently of billing reason', () => {
    const event = adapter.adapt(webhook({ billing_reason: 'subscription_create' }));
    expect(event.paymentId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(event.payload).toMatchObject({
      sourcePaymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceSubscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
  });
  it('accepts an absent PaymentIntent and legacy subscription reference', () => {
    expect(
      adapter.adapt(webhook({ parent: null, subscription: 'sub_legacy' })).payload.providerSubscriptionId,
    ).toBe('sub_legacy');
  });
  it.each([{ amount_due: null }, { amount_due: -1 }, { amount_due: 0.5 }, { currency: null }, { id: null }])(
    'rejects malformed invoice context %j',
    (payload) => {
      expect(() => adapter.adapt(webhook(payload))).toThrow();
    },
  );
  it('reads legacy source metadata and preserves missing source context explicitly', () => {
    expect(
      adapter.adapt(
        webhook({
          parent: null,
          subscription: 'sub_test',
          subscription_details: { metadata: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } },
        }),
      ).payload,
    ).toMatchObject({
      sourcePaymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceSubscriptionId: null,
    });
    expect(adapter.adapt(webhook({ parent: null, subscription: 'sub_test' })).payload).toMatchObject({
      sourcePaymentId: null,
      sourceSubscriptionId: null,
    });
  });
  it('rejects malformed source subscription metadata', () => {
    expect(() =>
      adapter.adapt(
        webhook({
          parent: {
            subscription_details: {
              subscription: 'sub_test',
              metadata: { subscriptionId: 'invalid' },
            },
          },
        }),
      ),
    ).toThrow();
  });
  it('preserves zero for application reconciliation rather than reporting malformed transport', () => {
    expect(adapter.adapt(webhook({ amount_due: 0 })).payload.amount).toBe(0);
  });
  it('only supports the Stripe finalized event', () => {
    expect(adapter.supports(webhook())).toBe(true);
    expect(adapter.supports({ ...webhook(), type: 'invoice.created' })).toBe(false);
  });
});
