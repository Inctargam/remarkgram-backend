import { Injectable } from '@nestjs/common';
import { InvalidProviderEventError } from '../../../application/errors/invalid-provider-event.error.js';
import type { PaymentIntentSucceededEvent } from '../../../application/events/payment-event.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import type { ProviderEventAdapter } from '../../../application/ports/provider-event-adapter.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import {
  asRecord,
  expandableId,
  metadataPaymentId,
  numberOrNull,
  stringOrNull,
} from './stripe-event-value.helpers.js';

@Injectable()
export class StripePaymentIntentSucceededAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return (
      webhook.provider === PaymentProvider.STRIPE &&
      webhook.type === (StripeEventType.PAYMENT_INTENT_SUCCEEDED as string)
    );
  }

  adapt(webhook: VerifiedProviderWebhook): PaymentIntentSucceededEvent {
    const paymentIntent = asRecord(webhook.payload);
    const id = stringOrNull(paymentIntent?.id);
    const amount = numberOrNull(paymentIntent?.amount_received);
    const currency = stringOrNull(paymentIntent?.currency);
    if (!id || amount === null || !currency)
      throw new InvalidProviderEventError('Stripe payment_intent.succeeded payload is incomplete');

    return {
      kind: PaymentEventKind.PAYMENT_INTENT_SUCCEEDED,
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: StripeEventType.PAYMENT_INTENT_SUCCEEDED,
      providerCreatedAt: webhook.createdAt,
      paymentId: metadataPaymentId(paymentIntent?.metadata),
      payload: {
        id,
        customerId: expandableId(paymentIntent?.customer),
        amount,
        currency,
        paidAt: webhook.createdAt,
      },
    };
  }
}
