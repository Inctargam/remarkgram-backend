import { Injectable } from '@nestjs/common';
import { InvalidProviderEventError } from '../../../application/errors/invalid-provider-event.error.js';
import type { InvoicePaidEvent } from '../../../application/events/payment-event.js';
import type { VerifiedProviderWebhook } from '../../../application/ports/payment-provider.js';
import type { ProviderEventAdapter } from '../../../application/ports/provider-event-adapter.js';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import { PaymentProvider } from '../../../domain/payment.entity.js';
import { StripeEventType } from './stripe-event-type.js';
import {
  asRecord,
  expandableId,
  metadataPaymentId,
  invoiceRenewalSourceReferences,
  numberOrNull,
  stringOrNull,
} from './stripe-event-value.helpers.js';

@Injectable()
export class StripeInvoicePaidAdapter implements ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean {
    return (
      webhook.provider === PaymentProvider.STRIPE && webhook.type === (StripeEventType.INVOICE_PAID as string)
    );
  }

  adapt(webhook: VerifiedProviderWebhook): InvoicePaidEvent {
    const invoice = asRecord(webhook.payload);
    const parent = asRecord(invoice?.parent);
    const subscriptionDetails = asRecord(parent?.subscription_details);
    const statusTransitions = asRecord(invoice?.status_transitions);
    const id = stringOrNull(invoice?.id);
    const amount = numberOrNull(invoice?.amount_paid);
    const currency = stringOrNull(invoice?.currency);
    const billingReason = stringOrNull(invoice?.billing_reason);
    if (!id || amount === null || !currency)
      throw new InvalidProviderEventError('Stripe invoice.paid payload is incomplete');

    const paidAtSeconds = numberOrNull(statusTransitions?.paid_at);
    const paymentId =
      billingReason === 'subscription_create'
        ? (metadataPaymentId(invoice?.metadata) ?? metadataPaymentId(subscriptionDetails?.metadata))
        : null;

    return {
      kind: PaymentEventKind.INVOICE_PAID,
      provider: webhook.provider,
      providerEventId: webhook.id,
      providerEventType: StripeEventType.INVOICE_PAID,
      providerCreatedAt: webhook.createdAt,
      paymentId,
      payload: {
        ...(billingReason === 'subscription_cycle' ? invoiceRenewalSourceReferences(invoice) : {}),
        id,
        customerId: expandableId(invoice?.customer),
        amount,
        currency,
        paidAt: paidAtSeconds === null ? webhook.createdAt : new Date(paidAtSeconds * 1000),
        providerPaymentId: expandableId(invoice?.payment_intent),
        providerSubscriptionId:
          expandableId(subscriptionDetails?.subscription) ?? expandableId(invoice?.subscription),
        providerInvoiceId: id,
        billingReason,
      },
    };
  }
}
