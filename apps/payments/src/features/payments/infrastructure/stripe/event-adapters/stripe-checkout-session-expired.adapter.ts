import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import type { CheckoutSessionExpiredEvent } from '../../../application/events/payment-event.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import type { ProviderEventAdapter } from '../../../application/ports/provider-event-adapter.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import { expandableId, numberOrNull, stringOrNull } from './stripe-event-value.helpers.js';

@Injectable()
export class StripeCheckoutSessionExpiredAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return (
      webhook.provider === PaymentProvider.STRIPE &&
      webhook.type === (StripeEventType.CHECKOUT_SESSION_EXPIRED as string)
    );
  }

  adapt(webhook: VerifiedProviderWebhook): CheckoutSessionExpiredEvent {
    const session = webhook.payload as Stripe.Checkout.Session;
    return {
      kind: PaymentEventKind.CHECKOUT_SESSION_EXPIRED,
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: StripeEventType.CHECKOUT_SESSION_EXPIRED,
      providerCreatedAt: webhook.createdAt,
      paymentId: session.metadata?.paymentId ?? null,
      payload: {
        id: session.id,
        customerId: expandableId(session.customer),
        mode: stringOrNull(session.mode),
        amount: numberOrNull(session.amount_total),
        currency: stringOrNull(session.currency),
      },
      snapshot: webhook.snapshot,
    };
  }
}
