import { Injectable } from '@nestjs/common';
import { InvalidProviderEventError } from '../../../application/errors/invalid-provider-event.error.js';
import type { InvoiceFinalizedEvent } from '../../../application/events/payment-event.js';
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
  numberOrNull,
  stringOrNull,
} from './stripe-event-value.helpers.js';

@Injectable()
export class StripeInvoiceFinalizedAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return (
      webhook.provider === PaymentProvider.STRIPE &&
      webhook.type === (StripeEventType.INVOICE_FINALIZED as string)
    );
  }

  adapt(webhook: VerifiedProviderWebhook): InvoiceFinalizedEvent {
    const invoice = asRecord(webhook.payload);
    const id = stringOrNull(invoice?.id);
    const amount = numberOrNull(invoice?.amount_due);
    const currency = stringOrNull(invoice?.currency);
    const billingReason = stringOrNull(invoice?.billing_reason);
    if (!id || amount === null || !Number.isSafeInteger(amount) || amount < 0 || !currency)
      throw new InvalidProviderEventError('Stripe invoice.finalized payload is incomplete');
    const details = asRecord(asRecord(invoice?.parent)?.subscription_details);
    return {
      kind: PaymentEventKind.INVOICE_FINALIZED,
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: StripeEventType.INVOICE_FINALIZED,
      providerCreatedAt: webhook.createdAt,
      // For a cycle Invoice, Subscription metadata identifies the source PURCHASE,
      // not the new RENEWAL Payment that will be created by the application use case.
      paymentId: billingReason === 'subscription_cycle' ? null : invoiceMetadataPaymentId(invoice),
      payload: {
        ...invoiceRenewalSourceReferences(invoice),
        providerInvoiceId: id,
        providerSubscriptionId: expandableId(details?.subscription) ?? expandableId(invoice?.subscription),
        customerId: expandableId(invoice?.customer),
        billingReason,
        amount,
        currency,
      },
    };
  }
}
