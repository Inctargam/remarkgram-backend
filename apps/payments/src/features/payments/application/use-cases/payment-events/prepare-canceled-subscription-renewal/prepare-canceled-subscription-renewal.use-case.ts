import { Injectable } from '@nestjs/common';
import { PaymentStatus, PaymentType } from '../../../../domain/payment.entity.js';
import { RenewalPaymentContextUnavailableError } from '../../../errors/renewal-payment-context-unavailable.error.js';
import type { SubscriptionDeletedEvent } from '../../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import {
  PaymentEventCompletionCode,
  PaymentEventRejectionReason,
  paymentEventResult,
  type PaymentEventResult,
} from '../payment-event-result.js';
import { hasProviderReferenceConflict } from '../payment-reconciliation.policy.js';

@Injectable()
export class PrepareCanceledSubscriptionRenewalUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: SubscriptionDeletedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    const candidates = event.payload.providerInvoiceId
      ? [await this.payments.findByProviderInvoiceId(event.provider, event.payload.providerInvoiceId, ctx)]
      : await this.payments.findPendingRenewalsByProviderSubscriptionId(
          event.provider,
          event.payload.providerSubscriptionId,
          ctx,
        );
    if (candidates.length > 1)
      throw new RenewalPaymentContextUnavailableError(
        event.payload.providerInvoiceId ?? event.payload.providerSubscriptionId,
        'AMBIGUOUS_PENDING_RENEWAL',
      );
    const payment = candidates[0];
    if (!payment && event.payload.providerInvoiceId)
      throw new RenewalPaymentContextUnavailableError(
        event.payload.providerInvoiceId,
        'INVOICE_PAYMENT_NOT_FOUND',
      );
    if (!payment)
      return paymentEventResult.completed(PaymentEventCompletionCode.SUBSCRIPTION_TERMINATED, null);
    if (payment.type !== PaymentType.RENEWAL || payment.checkoutPurpose !== null)
      return paymentEventResult.ignored(PaymentEventRejectionReason.INELIGIBLE_PAYMENT);

    if (
      hasProviderReferenceConflict(
        [payment.providerSubscriptionId, event.payload.providerSubscriptionId],
        [payment.providerInvoiceId, event.payload.providerInvoiceId],
        [payment.providerCustomerId, event.payload.customerId],
      )
    )
      return paymentEventResult.dead(PaymentEventRejectionReason.REFERENCE_CONFLICT);

    if (payment.status === PaymentStatus.CANCELED)
      return paymentEventResult.completed(PaymentEventCompletionCode.PAYMENT_CANCELED, payment.id);
    if ([PaymentStatus.SUCCEEDED, PaymentStatus.FAILED].includes(payment.status))
      return paymentEventResult.completed(PaymentEventCompletionCode.SUBSCRIPTION_TERMINATED, payment.id);
    if (payment.status !== PaymentStatus.PENDING)
      return paymentEventResult.dead(PaymentEventRejectionReason.INELIGIBLE_PAYMENT);
    if (!payment.providerInvoiceId)
      return paymentEventResult.dead(PaymentEventRejectionReason.INVOICE_REFERENCE_MISSING);

    return paymentEventResult.invoiceVoidRequired(payment.id, payment.providerInvoiceId);
  }
}
