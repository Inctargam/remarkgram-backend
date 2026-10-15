import { Injectable } from '@nestjs/common';
import { InvalidProviderEventError } from '../../../../../common/application/errors/payments.error.js';
import type { PaymentIntentPaymentFailedEvent } from '../../../application/events/payment-event.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import type { ProviderEventAdapter } from '../../../application/ports/provider-event-adapter.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import {
  asRecord,
  metadataPaymentId,
  safeProviderMessage,
  stringOrNull,
} from './stripe-event-value.helpers.js';

@Injectable()
export class StripePaymentIntentPaymentFailedAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return (
      webhook.provider === PaymentProvider.STRIPE &&
      webhook.type === (StripeEventType.PAYMENT_INTENT_PAYMENT_FAILED as string)
    );
  }

  adapt(webhook: VerifiedProviderWebhook): PaymentIntentPaymentFailedEvent {
    const paymentIntent = asRecord(webhook.payload);
    const id = stringOrNull(paymentIntent?.id);
    if (!id)
      throw new InvalidProviderEventError('Stripe payment_intent.payment_failed payload is incomplete');
    const lastPaymentError = asRecord(paymentIntent?.last_payment_error);

    return {
      kind: PaymentEventKind.PAYMENT_INTENT_PAYMENT_FAILED,
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: StripeEventType.PAYMENT_INTENT_PAYMENT_FAILED,
      providerCreatedAt: webhook.createdAt,
      paymentId: metadataPaymentId(paymentIntent?.metadata),
      payload: {
        id,
        providerCode: stringOrNull(lastPaymentError?.code),
        declineCode: stringOrNull(lastPaymentError?.decline_code),
        message: safeProviderMessage(lastPaymentError?.message),
        failedAt: webhook.createdAt,
      },
    };
  }
}
