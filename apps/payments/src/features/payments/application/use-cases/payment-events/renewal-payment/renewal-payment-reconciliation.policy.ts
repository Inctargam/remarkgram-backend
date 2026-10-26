import { Currency } from '../../../../../../common/domain/currency.enum.js';
import { PaymentEventKind } from '../../../../domain/payment-event-kind.js';
import { PaymentStatus, PaymentType, type Payment } from '../../../../domain/payment.entity.js';
import type { InvoiceFinalizedEvent, InvoicePaidEvent } from '../../../events/payment-event.js';
import { hasProviderReferenceConflict } from '../payment-reconciliation.policy.js';
import { PaymentEventResultCode } from '../payment-event-result.js';

type RenewalInvoiceEvent = InvoiceFinalizedEvent | InvoicePaidEvent;

/** The source supplies ownership and purchased period, never the new Invoice's financial facts. */
export class RenewalPaymentReconciliationPolicy {
  static sourceConflict(source: Payment, event: RenewalInvoiceEvent): PaymentEventResultCode | null {
    if (source.providerType !== event.provider) return PaymentEventResultCode.PROVIDER_MISMATCH;
    if (source.type !== PaymentType.PURCHASE) return PaymentEventResultCode.PURPOSE_MISMATCH;
    if (source.status !== PaymentStatus.SUCCEEDED || source.paidAt === null)
      return PaymentEventResultCode.INELIGIBLE_PAYMENT;
    if (
      source.subscriptionId &&
      event.payload.sourceSubscriptionId &&
      source.subscriptionId !== event.payload.sourceSubscriptionId
    )
      return PaymentEventResultCode.REFERENCE_CONFLICT;
    if (hasProviderReferenceConflict([source.providerSubscriptionId, event.payload.providerSubscriptionId]))
      return PaymentEventResultCode.REFERENCE_CONFLICT;
    if (hasProviderReferenceConflict([source.providerCustomerId, event.payload.customerId]))
      return PaymentEventResultCode.CUSTOMER_MISMATCH;
    return null;
  }

  static invoiceConflict(event: RenewalInvoiceEvent): PaymentEventResultCode | null {
    if (!Number.isSafeInteger(event.payload.amount) || event.payload.amount <= 0)
      return PaymentEventResultCode.AMOUNT_MISMATCH;
    if (!Object.values(Currency).includes(event.payload.currency.toUpperCase() as Currency))
      return PaymentEventResultCode.CURRENCY_MISMATCH;
    return null;
  }

  static paymentConflict(
    payment: Payment,
    event: RenewalInvoiceEvent,
    source?: Payment,
  ): PaymentEventResultCode | null {
    if (payment.providerType !== event.provider) return PaymentEventResultCode.PROVIDER_MISMATCH;
    if (payment.type !== PaymentType.RENEWAL || payment.checkoutPurpose !== null)
      return PaymentEventResultCode.PURPOSE_MISMATCH;
    if (!payment.subscriptionId) return PaymentEventResultCode.SUBSCRIPTION_ID_MISSING;
    //
    if (event.payload.sourceSubscriptionId && payment.subscriptionId !== event.payload.sourceSubscriptionId)
      return PaymentEventResultCode.REFERENCE_CONFLICT;
    if (
      source &&
      (payment.subscriptionId !== source.subscriptionId ||
        payment.userId !== source.userId ||
        payment.planId !== source.planId ||
        payment.periodCount !== source.periodCount ||
        payment.periodUnit !== source.periodUnit)
    )
      return PaymentEventResultCode.REFERENCE_CONFLICT;
    if (
      hasProviderReferenceConflict(
        [payment.providerInvoiceId, event.payload.providerInvoiceId],
        [payment.providerSubscriptionId, event.payload.providerSubscriptionId],
      )
    )
      return PaymentEventResultCode.REFERENCE_CONFLICT;
    if (hasProviderReferenceConflict([payment.providerCustomerId, event.payload.customerId]))
      return PaymentEventResultCode.CUSTOMER_MISMATCH;
    if (payment.currency.toLowerCase() !== event.payload.currency.toLowerCase())
      return PaymentEventResultCode.CURRENCY_MISMATCH;
    // A late finalized event describes amount_due, not necessarily the collected amount.
    if (event.kind === PaymentEventKind.INVOICE_FINALIZED && payment.status === PaymentStatus.SUCCEEDED)
      return null;
    if (payment.amount !== event.payload.amount) return PaymentEventResultCode.AMOUNT_MISMATCH;
    if (
      'providerPaymentId' in event.payload &&
      hasProviderReferenceConflict([payment.providerPaymentId, event.payload.providerPaymentId])
    )
      return PaymentEventResultCode.REFERENCE_CONFLICT;
    return null;
  }
}
