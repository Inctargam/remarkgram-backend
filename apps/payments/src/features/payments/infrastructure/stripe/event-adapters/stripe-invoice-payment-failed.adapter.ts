import { Injectable } from '@nestjs/common';
import { InvalidProviderEventError } from '../../../../../common/application/errors/payments.error.js';
import type { InvoicePaymentFailedEvent } from '../../../application/events/payment-event.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import type { ProviderEventAdapter } from '../../../application/ports/provider-event-adapter.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import {
  asRecord,
  expandableId,
  metadataPaymentId,
  safeProviderMessage,
  stringOrNull,
} from './stripe-event-value.helpers.js';

@Injectable()
export class StripeInvoicePaymentFailedAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return (
      webhook.provider === PaymentProvider.STRIPE &&
      webhook.type === StripeEventType.INVOICE_PAYMENT_FAILED
    );
  }

  adapt(webhook: VerifiedProviderWebhook): InvoicePaymentFailedEvent {
    const invoice = asRecord(webhook.payload);
    const id = stringOrNull(invoice?.id);
    if (!id)
      throw new InvalidProviderEventError('Stripe invoice.payment_failed payload is incomplete');

    const parent = asRecord(invoice?.parent);
    const subscriptionDetails = asRecord(parent?.subscription_details);
    const billingReason = stringOrNull(invoice?.billing_reason);
    const paymentIntent = asRecord(invoice?.payment_intent);
    const paymentError =
      asRecord(paymentIntent?.last_payment_error) ??
      asRecord(invoice?.last_payment_error) ??
      asRecord(invoice?.last_finalization_error);

    return {
      kind: PaymentEventKind.INVOICE_PAYMENT_FAILED,
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: StripeEventType.INVOICE_PAYMENT_FAILED,
      providerCreatedAt: webhook.createdAt,
      paymentId:
        billingReason === 'subscription_create'
          ? (metadataPaymentId(invoice?.metadata) ?? metadataPaymentId(subscriptionDetails?.metadata))
          : null,
      payload: {
        id,
        customerId: expandableId(invoice?.customer),
        billingReason,
        providerPaymentId: expandableId(invoice?.payment_intent),
        providerSubscriptionId:
          expandableId(subscriptionDetails?.subscription) ?? expandableId(invoice?.subscription),
        providerInvoiceId: id,
        providerCode: stringOrNull(paymentError?.code),
        declineCode: stringOrNull(paymentError?.decline_code),
        message: safeProviderMessage(paymentError?.message),
        failedAt: webhook.createdAt,
      },
    };
  }
}
