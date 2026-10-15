import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import type { CheckoutSessionCompletedEvent } from '../../../application/events/payment-event.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import type { ProviderEventAdapter } from '../../../application/ports/provider-event-adapter.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import { expandableId, numberOrNull, stringOrNull } from './stripe-event-value.helpers.js';

@Injectable()
export class StripeCheckoutSessionCompletedAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return (
      webhook.provider === PaymentProvider.STRIPE &&
      webhook.type === (StripeEventType.CHECKOUT_SESSION_COMPLETED as string)
    );
  }

  adapt(webhook: VerifiedProviderWebhook): CheckoutSessionCompletedEvent {
    const session = webhook.payload as Stripe.Checkout.Session;
    return {
      kind: PaymentEventKind.CHECKOUT_SESSION_COMPLETED,
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: StripeEventType.CHECKOUT_SESSION_COMPLETED,
      providerCreatedAt: webhook.createdAt,
      // Stripe-specific способ корреляции остаётся внутри адаптера.
      paymentId: session.metadata?.paymentId ?? null,
      payload: {
        id: session.id,
        customerId: expandableId(session.customer),
        mode: stringOrNull(session.mode),
        paymentStatus: stringOrNull(session.payment_status),
        providerPaymentId: expandableId(session.payment_intent),
        providerSubscriptionId: expandableId(session.subscription),
        amount: numberOrNull(session.amount_total),
        currency: stringOrNull(session.currency),
      },
      snapshot: webhook.snapshot,
    };
  }
}
