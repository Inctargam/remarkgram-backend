import { Injectable } from '@nestjs/common';
import { InvalidProviderEventError } from '../../../application/errors/invalid-provider-event.error.js';
import type { PaymentIntentCanceledEvent } from '../../../application/events/payment-event.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import type { ProviderEventAdapter } from '../../../application/ports/provider-event-adapter.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import { asRecord, expandableId, metadataPaymentId, stringOrNull } from './stripe-event-value.helpers.js';

@Injectable()
export class StripePaymentIntentCanceledAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return (
      webhook.provider === PaymentProvider.STRIPE &&
      webhook.type === (StripeEventType.PAYMENT_INTENT_CANCELED as string)
    );
  }

  adapt(webhook: VerifiedProviderWebhook): PaymentIntentCanceledEvent {
    const paymentIntent = asRecord(webhook.payload);
    const id = stringOrNull(paymentIntent?.id);
    if (!id) throw new InvalidProviderEventError('Stripe payment_intent.canceled payload is incomplete');

    return {
      kind: PaymentEventKind.PAYMENT_INTENT_CANCELED,
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: StripeEventType.PAYMENT_INTENT_CANCELED,
      providerCreatedAt: webhook.createdAt,
      paymentId: metadataPaymentId(paymentIntent?.metadata),
      payload: {
        id,
        customerId: expandableId(paymentIntent?.customer),
        canceledAt: webhook.createdAt,
      },
    };
  }
}
