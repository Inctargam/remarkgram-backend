import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import { StripeInvoiceVoidedAdapter } from './stripe-invoice-voided.adapter.js';
import { StripeEventType } from './stripe-event-type.js';

const adapter = new StripeInvoiceVoidedAdapter();

describe('StripeInvoiceVoidedAdapter', () => {
  it('normalizes a cycle Invoice without treating source payment metadata as the renewal ID', () => {
    const event = adapter.adapt(
      webhook({
        id: 'in_voided',
        billing_reason: 'subscription_cycle',
        customer: 'cus_test',
        parent: {
          subscription_details: {
            subscription: 'sub_test',
            metadata: {
              paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              subscriptionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            },
          },
        },
      }),
    );

    expect(event).toMatchObject({
      kind: PaymentEventKind.INVOICE_VOIDED,
      paymentId: null,
      payload: {
        providerInvoiceId: 'in_voided',
        providerSubscriptionId: 'sub_test',
        customerId: 'cus_test',
        billingReason: 'subscription_cycle',
        sourcePaymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourceSubscriptionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    });
  });

  it('supports legacy Invoice subscription details', () => {
    const event = adapter.adapt(
      webhook({
        id: 'in_legacy',
        billing_reason: 'subscription_cycle',
        subscription: 'sub_legacy',
        subscription_details: {
          metadata: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        },
      }),
    );

    expect(event.payload).toMatchObject({
      providerSubscriptionId: 'sub_legacy',
      sourcePaymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('rejects an Invoice without an ID', () => {
    expect(() => adapter.adapt(webhook({ billing_reason: 'subscription_cycle' }))).toThrow(
      'Stripe invoice.voided payload is incomplete',
    );
  });

  it('only supports Stripe invoice.voided', () => {
    expect(adapter.supports(webhook({ id: 'in_voided' }))).toBe(true);
    expect(adapter.supports({ ...webhook({ id: 'in_voided' }), type: 'invoice.paid' })).toBe(false);
  });
});

function webhook(payload: Record<string, unknown>): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_voided',
    type: StripeEventType.INVOICE_VOIDED,
    createdAt: new Date('2026-10-26T12:00:00.000Z'),
    payload,
    snapshot: {},
  };
}
