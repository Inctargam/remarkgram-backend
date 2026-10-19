import { describe, expect, it } from 'vitest';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import { StripePaymentIntentCanceledAdapter } from './stripe-payment-intent-canceled.adapter.js';

describe('StripePaymentIntentCanceledAdapter', () => {
  const adapter = new StripePaymentIntentCanceledAdapter();

  it('normalizes a sanitized payment_intent.canceled fixture', () => {
    expect(adapter.adapt(webhook())).toEqual({
      kind: PaymentEventKind.PAYMENT_INTENT_CANCELED,
      provider: PaymentProvider.STRIPE,
      providerEventId: 'evt_canceled',
      providerEventType: StripeEventType.PAYMENT_INTENT_CANCELED,
      providerCreatedAt: CANCELED_AT,
      paymentId: PAYMENT_ID,
      payload: {
        id: 'pi_canceled',
        customerId: 'cus_test',
        canceledAt: CANCELED_AT,
      },
    });
  });
});

const PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CANCELED_AT = new Date('2026-10-17T12:00:00.000Z');

function webhook(): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_canceled',
    type: StripeEventType.PAYMENT_INTENT_CANCELED,
    createdAt: CANCELED_AT,
    payload: {
      id: 'pi_canceled',
      customer: 'cus_test',
      metadata: { paymentId: PAYMENT_ID },
      status: 'canceled',
      cancellation_reason: 'requested_by_customer',
    },
    snapshot: { id: 'evt_canceled' },
  };
}
