import { describe, expect, it } from 'vitest';
import type { VerifiedProviderWebhook } from '../application/ports/payment-provider.js';
import { PaymentProvider } from '../domain/payment.entity.js';
import { StripeCheckoutSessionCompletedAdapter } from './stripe-checkout-session-completed.adapter.js';

describe('StripeCheckoutSessionCompletedAdapter', () => {
  const adapter = new StripeCheckoutSessionCompletedAdapter();

  it('поддерживает только Stripe checkout.session.completed', () => {
    expect(adapter.supports(webhook())).toBe(true);
    expect(adapter.supports(webhook({ type: 'invoice.paid' }))).toBe(false);
  });

  it('преобразует Checkout Session в типизированное событие без вычисления финансового outcome', () => {
    const event = adapter.adapt(webhook());

    expect(event.kind).toBe('CHECKOUT_SESSION_COMPLETED');
    expect(event.providerEventId).toBe('evt_test');
    expect(event.providerEventType).toBe('checkout.session.completed');
    expect(event.checkout.id).toBe('cs_test');
    expect(event.checkout.paymentStatus).toBe('paid');
    expect(event.checkout.internalPaymentId).toBe('payment-id');
    expect(event.checkout.providerPaymentId).toBe('pi_test');
  });
});

function webhook(overrides: Partial<VerifiedProviderWebhook> = {}): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_test',
    type: 'checkout.session.completed',
    createdAt: new Date('2026-10-11T12:00:00.000Z'),
    payload: {
      id: 'cs_test',
      metadata: { paymentId: 'payment-id' },
      customer: 'cus_test',
      mode: 'payment',
      payment_status: 'paid',
      payment_intent: { id: 'pi_test' },
      subscription: null,
      invoice: null,
      amount_total: 10_000,
      currency: 'usd',
    },
    snapshot: { id: 'evt_test' },
    ...overrides,
  };
}
