import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import type { CheckoutSessionCompletedEvent } from '../application/events/payment-event.js';
import type { VerifiedProviderWebhook } from '../application/ports/payment-provider.js';
import type { ProviderEventAdapter } from '../application/ports/provider-event-adapter.js';
import { PaymentProvider } from '../domain/payment.entity.js';

@Injectable()
export class StripeCheckoutSessionCompletedAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return webhook.provider === PaymentProvider.STRIPE && webhook.type === 'checkout.session.completed';
  }

  adapt(webhook: VerifiedProviderWebhook): CheckoutSessionCompletedEvent {
    const session = webhook.payload as Stripe.Checkout.Session;
    return {
      kind: 'CHECKOUT_SESSION_COMPLETED',
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: 'checkout.session.completed',
      providerCreatedAt: webhook.createdAt,
      checkout: {
        id: session.id,
        internalPaymentId: session.metadata?.paymentId ?? null,
        customerId: expandableId(session.customer),
        mode: stringOrNull(session.mode),
        paymentStatus: stringOrNull(session.payment_status),
        providerPaymentId: expandableId(session.payment_intent),
        providerSubscriptionId: expandableId(session.subscription),
        providerInvoiceId: expandableId(session.invoice),
        amount: numberOrNull(session.amount_total),
        currency: stringOrNull(session.currency),
      },
      snapshot: webhook.snapshot,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function expandableId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return stringOrNull(asRecord(value)?.id);
}
