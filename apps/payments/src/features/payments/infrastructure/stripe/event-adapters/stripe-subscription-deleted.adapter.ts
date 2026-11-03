import { Injectable } from '@nestjs/common';
import { InvalidProviderEventError } from '../../../application/errors/invalid-provider-event.error.js';
import type { SubscriptionDeletedEvent } from '../../../application/events/payment-event.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import type { ProviderEventAdapter } from '../../../application/ports/provider-event-adapter.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import { asRecord, expandableId, stringOrNull } from './stripe-event-value.helpers.js';

@Injectable()
export class StripeSubscriptionDeletedAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return (
      webhook.provider === PaymentProvider.STRIPE &&
      webhook.type === (StripeEventType.CUSTOMER_SUBSCRIPTION_DELETED as string)
    );
  }

  adapt(webhook: VerifiedProviderWebhook): SubscriptionDeletedEvent {
    const subscription = asRecord(webhook.payload);
    const providerSubscriptionId = stringOrNull(subscription?.id);
    if (!providerSubscriptionId)
      throw new InvalidProviderEventError('Stripe customer.subscription.deleted payload is incomplete');

    const canceledAt = this.timestampOrNull(subscription?.canceled_at ?? subscription?.ended_at);
    return {
      kind: PaymentEventKind.SUBSCRIPTION_DELETED,
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: StripeEventType.CUSTOMER_SUBSCRIPTION_DELETED,
      providerCreatedAt: webhook.createdAt,
      // Subscription metadata points to the source purchase, not to its renewal Payment.
      paymentId: null,
      payload: {
        providerSubscriptionId,
        providerInvoiceId: expandableId(subscription?.latest_invoice),
        customerId: expandableId(subscription?.customer),
        status: stringOrNull(subscription?.status),
        canceledAt,
        cancellationReason: stringOrNull(asRecord(subscription?.cancellation_details)?.reason),
      },
    };
  }

  private timestampOrNull(value: unknown): Date | null {
    return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null;
  }
}
