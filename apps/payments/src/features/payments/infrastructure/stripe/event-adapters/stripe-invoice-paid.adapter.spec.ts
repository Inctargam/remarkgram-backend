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
    expect(event.payload.sourcePaymentId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(event.payload.sourceSubscriptionId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(event.payload.billingReason).toBe('subscription_cycle');
    expect(event.payload.providerSubscriptionId).toBe('sub_test');
  });
  it('reads the legacy Invoice Subscription metadata snapshot', () => {
    const value = webhook();
    value.payload = { ...(value.payload as Record<string, unknown>), billing_reason: 'subscription_cycle', parent: null,
      subscription: 'sub_test', subscription_details: { metadata: {
        paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      } } };
    expect(adapter.adapt(value).payload).toMatchObject({
      sourcePaymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceSubscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
  });

  it('does not use top-level Invoice metadata as the renewal source snapshot', () => {
    const value = webhook();
    value.payload = { ...(value.payload as Record<string, unknown>), billing_reason: 'subscription_cycle',
      parent: { subscription_details: { subscription: 'sub_test', metadata: {} } },
      metadata: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } };
    expect(adapter.adapt(value).payload.sourcePaymentId).toBeNull();
  });

  it('rejects a malformed identifier in Subscription metadata', () => {
    const value = webhook();
    value.payload = { ...(value.payload as Record<string, unknown>), billing_reason: 'subscription_cycle',
      parent: { subscription_details: { subscription: 'sub_test', metadata: { paymentId: 'bad-id' } } } };
    expect(() => adapter.adapt(value)).toThrow();
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
          metadata: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
        },
      },
    },
    snapshot: { id: 'evt_invoice_paid' },
  };
  return { ...value, ...overrides };
}
