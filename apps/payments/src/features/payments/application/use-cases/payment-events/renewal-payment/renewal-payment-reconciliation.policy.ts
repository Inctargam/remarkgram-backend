import { Currency } from '../../../../../../common/domain/currency.enum.js';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import { PaymentStatus, PaymentType, type Payment } from '../../../../domain/payment.entity.js';
import type { InvoiceFinalizedEvent, InvoicePaidEvent } from '../../../events/payment-event.js';
import { hasProviderReferenceConflict } from '../payment-reconciliation.policy.js';
import { PaymentEventRejectionReason } from '../payment-event-result.js';

type RenewalInvoiceEvent = InvoiceFinalizedEvent | InvoicePaidEvent;

/** The source is a historical ownership/period snapshot; its lifecycle does not prove the new Invoice payment. */
export class RenewalPaymentReconciliationPolicy {
  static sourceConflict(source: Payment, event: RenewalInvoiceEvent): PaymentEventRejectionReason | null {
    if (source.providerType.toLowerCase() !== event.provider.toLowerCase()) {
      return PaymentEventRejectionReason.PROVIDER_MISMATCH;
    }
    if (
      source.subscriptionId &&
      event.payload.sourceSubscriptionId &&
      source.subscriptionId !== event.payload.sourceSubscriptionId
    ) {
      return PaymentEventRejectionReason.REFERENCE_CONFLICT;
    }
    if (hasProviderReferenceConflict([source.providerSubscriptionId, event.payload.providerSubscriptionId])) {
      return PaymentEventRejectionReason.REFERENCE_CONFLICT;
    }
    if (hasProviderReferenceConflict([source.providerCustomerId, event.payload.customerId])) {
      return PaymentEventRejectionReason.CUSTOMER_MISMATCH;
    }
    return null;
  }

  static invoiceConflict(event: RenewalInvoiceEvent): PaymentEventRejectionReason | null {
    if (!Number.isSafeInteger(event.payload.amount) || event.payload.amount <= 0)
      return PaymentEventRejectionReason.AMOUNT_MISMATCH;
    if (!Object.values(Currency).includes(event.payload.currency.toUpperCase() as Currency))
      return PaymentEventRejectionReason.CURRENCY_MISMATCH;
    return null;
  }

  static paymentConflict(
    payment: Payment,
    event: RenewalInvoiceEvent,
    source?: Payment,
  ): PaymentEventRejectionReason | null {
    if (payment.providerType.toLowerCase() !== event.provider.toLowerCase()) {
      return PaymentEventRejectionReason.PROVIDER_MISMATCH;
    }
    if (payment.type !== PaymentType.RENEWAL || payment.checkoutPurpose !== null) {
      return PaymentEventRejectionReason.PURPOSE_MISMATCH;
    }
    if (!payment.subscriptionId) {
      return PaymentEventRejectionReason.SUBSCRIPTION_ID_MISSING;
    }
    //
    if (event.payload.sourceSubscriptionId && payment.subscriptionId !== event.payload.sourceSubscriptionId) {
      return PaymentEventRejectionReason.REFERENCE_CONFLICT;
    }
    if (
      source &&
      (payment.subscriptionId !== source.subscriptionId ||
        payment.userId !== source.userId ||
        payment.planId !== source.planId ||
        payment.periodCount !== source.periodCount ||
        payment.periodUnit !== source.periodUnit)
    ) {
      return PaymentEventRejectionReason.REFERENCE_CONFLICT;
    }
    if (
      hasProviderReferenceConflict(
        [payment.providerInvoiceId, event.payload.providerInvoiceId],
        [payment.providerSubscriptionId, event.payload.providerSubscriptionId],
      )
    ) {
      return PaymentEventRejectionReason.REFERENCE_CONFLICT;
    }
    if (hasProviderReferenceConflict([payment.providerCustomerId, event.payload.customerId]))
      return PaymentEventRejectionReason.CUSTOMER_MISMATCH;
    if (payment.currency.toLowerCase() !== event.payload.currency.toLowerCase())
      return PaymentEventRejectionReason.CURRENCY_MISMATCH;
    // A late finalized event describes amount_due, not necessarily the collected amount.
    if (event.kind === PaymentEventKind.INVOICE_FINALIZED && payment.status === PaymentStatus.SUCCEEDED)
      return null;
    if (payment.amount !== event.payload.amount) return PaymentEventRejectionReason.AMOUNT_MISMATCH;
    if (
      'providerPaymentId' in event.payload &&
      hasProviderReferenceConflict([payment.providerPaymentId, event.payload.providerPaymentId])
    )
      return PaymentEventRejectionReason.REFERENCE_CONFLICT;
    return null;
  }
}
