import { describe, expect, it } from 'vitest';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import { StripeInvoicePaymentFailedAdapter } from './stripe-invoice-payment-failed.adapter.js';

describe('StripeInvoicePaymentFailedAdapter', () => {
  const adapter = new StripeInvoicePaymentFailedAdapter();

  it('normalizes initial Invoice failure metadata and safe failure fields', () => {
    const event = adapter.adapt(webhook('subscription_create'));

    expect(event.kind).toBe(PaymentEventKind.INVOICE_PAYMENT_FAILED);
    expect(event.paymentId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(event.payload).toMatchObject({
      providerInvoiceId: 'in_failed',
      providerSubscriptionId: 'sub_test',
      providerPaymentId: 'pi_failed',
      providerCode: 'card_declined',
      declineCode: 'insufficient_funds',
      message: 'Your card was declined. Try another card.',
    });
    expect(JSON.stringify(event)).not.toContain('payment_method');
    expect(JSON.stringify(event)).not.toContain('4242');
  });

  it('does not correlate renewal failure to initial Payment metadata', () => {
    const event = adapter.adapt(webhook('subscription_cycle'));

    expect(event.paymentId).toBeNull();
    expect(event.payload.providerSubscriptionId).toBe('sub_test');
  });
});

function webhook(billingReason: string): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_invoice_failed',
    type: StripeEventType.INVOICE_PAYMENT_FAILED,
    createdAt: new Date('2026-10-13T12:00:00.000Z'),
    payload: {
      id: 'in_failed',
      customer: 'cus_test',
      billing_reason: billingReason,
      payment_intent: {
        id: 'pi_failed',
        last_payment_error: {
          code: 'card_declined',
          decline_code: 'insufficient_funds',
          message: 'Your card was declined.\nTry another card.',
          payment_method: { card: { last4: '4242' } },
        },
      },
      parent: {
        subscription_details: {
          subscription: 'sub_test',
          metadata: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        },
      },
    },
    snapshot: { id: 'evt_invoice_failed' },
  };
}
