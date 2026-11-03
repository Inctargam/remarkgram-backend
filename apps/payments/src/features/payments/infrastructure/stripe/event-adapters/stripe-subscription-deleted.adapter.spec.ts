import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import { StripeSubscriptionDeletedAdapter } from './stripe-subscription-deleted.adapter.js';

const adapter = new StripeSubscriptionDeletedAdapter();

describe('StripeSubscriptionDeletedAdapter', () => {
  it('normalizes the terminal Subscription without linking source metadata as a renewal Payment', () => {
    const event = adapter.adapt(
      webhook({
        id: 'sub_test',
        customer: 'cus_test',
        latest_invoice: 'in_open',
        status: 'canceled',
        canceled_at: 1_798_761_600,
        cancellation_details: { reason: 'payment_failed' },
        metadata: { paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      }),
    );

    expect(event).toEqual({
      kind: PaymentEventKind.SUBSCRIPTION_DELETED,
      provider: PaymentProvider.STRIPE,
      providerEventId: 'evt_subscription_deleted',
      providerEventType: StripeEventType.CUSTOMER_SUBSCRIPTION_DELETED,
      providerCreatedAt: new Date('2027-01-01T00:00:00.000Z'),
      paymentId: null,
      payload: {
        providerSubscriptionId: 'sub_test',
        providerInvoiceId: 'in_open',
        customerId: 'cus_test',
        status: 'canceled',
        canceledAt: new Date('2027-01-01T00:00:00.000Z'),
        cancellationReason: 'payment_failed',
      },
    });
  });

  it('accepts expanded references and nullable terminal details', () => {
    const event = adapter.adapt(
      webhook({ id: 'sub_test', customer: { id: 'cus_test' }, latest_invoice: { id: 'in_open' } }),
    );

    expect(event.payload).toMatchObject({
      providerInvoiceId: 'in_open',
      customerId: 'cus_test',
      status: null,
      canceledAt: null,
      cancellationReason: null,
    });
  });

  it('rejects a Subscription without an ID', () => {
    expect(() => adapter.adapt(webhook({ status: 'canceled' }))).toThrow(
      'Stripe customer.subscription.deleted payload is incomplete',
    );
  });

  it('only supports Stripe customer.subscription.deleted', () => {
    expect(adapter.supports(webhook({ id: 'sub_test' }))).toBe(true);
    expect(adapter.supports({ ...webhook({ id: 'sub_test' }), type: 'customer.subscription.updated' })).toBe(
      false,
    );
    expect(
      adapter.supports({
        ...webhook({ id: 'sub_test' }),
        provider: 'OTHER' as PaymentProvider,
      }),
    ).toBe(false);
  });
});

function webhook(payload: Record<string, unknown>): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_subscription_deleted',
    type: StripeEventType.CUSTOMER_SUBSCRIPTION_DELETED,
    createdAt: new Date('2027-01-01T00:00:00.000Z'),
    payload,
    snapshot: {},
  };
}
