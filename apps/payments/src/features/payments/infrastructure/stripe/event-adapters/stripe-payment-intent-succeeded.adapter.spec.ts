import { describe, expect, it } from 'vitest';
import { InvalidProviderEventError } from '../../../../../common/application/errors/payments.error.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import { StripePaymentIntentSucceededAdapter } from './stripe-payment-intent-succeeded.adapter.js';

describe('StripePaymentIntentSucceededAdapter', () => {
  const adapter = new StripePaymentIntentSucceededAdapter();

  it('supports only Stripe payment_intent.succeeded', () => {
    expect(adapter.supports(webhook())).toBe(true);
    expect(adapter.supports(webhook({ type: StripeEventType.INVOICE_PAID }))).toBe(false);
    expect(adapter.supports(webhook({ provider: PaymentProvider.PAYPAL }))).toBe(false);
  });

  it('normalizes payment_intent.succeeded for an extension payment', () => {
    const event = adapter.adapt(webhook());

    expect(event.kind).toBe(PaymentEventKind.PAYMENT_INTENT_SUCCEEDED);
    expect(event.paymentId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(event.payload.id).toBe('pi_test');
    expect(event.payload.customerId).toBe('cus_test');
    expect(event.payload.amount).toBe(10_000);
    expect(event.payload.currency).toBe('usd');
    expect(event.payload.paidAt).toEqual(new Date('2026-10-12T12:00:00.000Z'));
  });

  it('keeps provider PaymentIntent correlation when paymentId metadata is absent', () => {
    const event = adapter.adapt(
      webhook({
        payload: {
          ...(webhook().payload as Record<string, unknown>),
          metadata: {},
        },
      }),
    );

    expect(event.paymentId).toBeNull();
    expect(event.payload.id).toBe('pi_test');
  });

  it.each([
    { id: null, amount_received: 10_000, currency: 'usd' },
    { id: 'pi_test', amount_received: null, currency: 'usd' },
    { id: 'pi_test', amount_received: 10_000, currency: null },
  ])('rejects an incomplete succeeded payload %#', (payload) => {
    expect(() => adapter.adapt(webhook({ payload }))).toThrow(InvalidProviderEventError);
  });
});

function webhook(overrides: Partial<VerifiedProviderWebhook> = {}): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_pi_succeeded',
    type: StripeEventType.PAYMENT_INTENT_SUCCEEDED,
    createdAt: new Date('2026-10-12T12:00:00.000Z'),
    payload: {
      id: 'pi_test',
      metadata: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      customer: 'cus_test',
      amount_received: 10_000,
      currency: 'usd',
    },
    snapshot: { id: 'evt_pi_succeeded' },
    ...overrides,
  };
}
