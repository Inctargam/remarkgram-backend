import { describe, expect, it } from 'vitest';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeCheckoutSessionCompletedAdapter } from './stripe-checkout-session-completed.adapter.js';
import { StripeEventType } from './stripe-event-type.js';

describe('StripeCheckoutSessionCompletedAdapter', () => {
  const adapter = new StripeCheckoutSessionCompletedAdapter();

  it('поддерживает только Stripe checkout.session.completed', () => {
    expect(adapter.supports(webhook())).toBe(true);
    expect(adapter.supports(webhook({ type: StripeEventType.INVOICE_PAID }))).toBe(false);
    expect(adapter.supports(webhook({ provider: PaymentProvider.PAYPAL }))).toBe(false);
  });

  it.each(['paid', 'unpaid', 'no_payment_required'])(
    'принимает completed с payment_status=%s без вычисления financial success',
    (paymentStatus) => {
      const input = webhook({
        payload: { ...(webhook().payload as Record<string, unknown>), payment_status: paymentStatus },
      });

      expect(adapter.supports(input)).toBe(true);
      expect(adapter.adapt(input).payload.paymentStatus).toBe(paymentStatus);
    },
  );

  it('преобразует Checkout Session в типизированное событие без вычисления финансового outcome', () => {
    const event = adapter.adapt(webhook());

    expect(event.kind).toBe(PaymentEventKind.CHECKOUT_SESSION_COMPLETED);
    expect(event.providerEventId).toBe('evt_test');
    expect(event.providerEventType).toBe(StripeEventType.CHECKOUT_SESSION_COMPLETED);
    expect(event.payload.id).toBe('cs_test');
    expect(event.payload.paymentStatus).toBe('paid');
    expect(event.paymentId).toBe('payment-id');
    expect(event.payload.providerPaymentId).toBe('pi_test');
  });
});

function webhook(overrides: Partial<VerifiedProviderWebhook> = {}): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_test',
    type: StripeEventType.CHECKOUT_SESSION_COMPLETED,
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
