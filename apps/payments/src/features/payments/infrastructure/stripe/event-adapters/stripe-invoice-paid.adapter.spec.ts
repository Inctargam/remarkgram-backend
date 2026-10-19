import { describe, expect, it } from 'vitest';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import { StripeInvoicePaidAdapter } from './stripe-invoice-paid.adapter.js';

describe('StripeInvoicePaidAdapter', () => {
  const adapter = new StripeInvoicePaidAdapter();

  it('extracts initial payment correlation from subscription details metadata', () => {
    const event = adapter.adapt(webhook());

    expect(event.kind).toBe(PaymentEventKind.INVOICE_PAID);
    expect(event.paymentId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(event.payload.providerInvoiceId).toBe('in_test');
    expect(event.payload.providerSubscriptionId).toBe('sub_test');
    expect(event.payload.paidAt).toEqual(new Date('2026-10-12T12:00:01.000Z'));
  });

  it('does not correlate a renewal to the initial Payment metadata', () => {
    const renewalWebhook = webhook();
    renewalWebhook.payload = {
      ...(renewalWebhook.payload as Record<string, unknown>),
      id: 'in_cycle',
      billing_reason: 'subscription_cycle',
    };
    const event = adapter.adapt(renewalWebhook);

    expect(event.paymentId).toBeNull();
    expect(event.payload.billingReason).toBe('subscription_cycle');
    expect(event.payload.providerSubscriptionId).toBe('sub_test');
  });
});

function webhook(overrides: Partial<VerifiedProviderWebhook> = {}): VerifiedProviderWebhook {
  const value: VerifiedProviderWebhook = {
    provider: PaymentProvider.STRIPE,
    id: 'evt_invoice_paid',
    type: StripeEventType.INVOICE_PAID,
    createdAt: new Date('2026-10-12T12:00:02.000Z'),
    payload: {
      id: 'in_test',
      customer: 'cus_test',
      amount_paid: 10_000,
      currency: 'usd',
      billing_reason: 'subscription_create',
      status_transitions: { paid_at: 1791806401 },
      parent: {
        subscription_details: {
          subscription: 'sub_test',
          metadata: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        },
      },
    },
    snapshot: { id: 'evt_invoice_paid' },
  };
  return { ...value, ...overrides };
}
