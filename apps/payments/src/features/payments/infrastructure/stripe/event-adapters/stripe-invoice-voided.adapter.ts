import { Injectable } from '@nestjs/common';
import { InvalidProviderEventError } from '../../../application/errors/invalid-provider-event.error.js';
import type { InvoiceVoidedEvent } from '../../../application/events/payment-event.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import type { ProviderEventAdapter } from '../../../application/ports/provider-event-adapter.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import {
  asRecord,
  expandableId,
  invoiceMetadataPaymentId,
  invoiceRenewalSourceReferences,
  stringOrNull,
} from './stripe-event-value.helpers.js';

@Injectable()
export class StripeInvoiceVoidedAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return (
      webhook.provider === PaymentProvider.STRIPE && webhook.type === StripeEventType.INVOICE_VOIDED
    );
  }

  adapt(webhook: VerifiedProviderWebhook): InvoiceVoidedEvent {
    const invoice = asRecord(webhook.payload);
    const providerInvoiceId = stringOrNull(invoice?.id);
    const billingReason = stringOrNull(invoice?.billing_reason);
    if (!providerInvoiceId)
      throw new InvalidProviderEventError('Stripe invoice.voided payload is incomplete');

    const subscriptionDetails = asRecord(asRecord(invoice?.parent)?.subscription_details);
    return {
      kind: PaymentEventKind.INVOICE_VOIDED,
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: StripeEventType.INVOICE_VOIDED,
      providerCreatedAt: webhook.createdAt,
      // For an automatic renewal this metadata identifies the source purchase, not the renewal.
      paymentId: billingReason === 'subscription_cycle' ? null : invoiceMetadataPaymentId(invoice),
      payload: {
        ...invoiceRenewalSourceReferences(invoice),
        providerInvoiceId,
        providerSubscriptionId:
          expandableId(subscriptionDetails?.subscription) ?? expandableId(invoice?.subscription),
        customerId: expandableId(invoice?.customer),
        billingReason,
      },
    };
  }
}
