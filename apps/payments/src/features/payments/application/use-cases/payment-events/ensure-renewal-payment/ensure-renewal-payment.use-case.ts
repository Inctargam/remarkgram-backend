import { Injectable } from '@nestjs/common';
import type { Currency } from '../../../../../../common/domain/currency.enum.js';
import type { Payment } from '../../../../domain/payment.entity.js';
import { RenewalPaymentContextUnavailableError } from '../../../errors/renewal-payment-context-unavailable.error.js';
import type { InvoiceFinalizedEvent } from '../../../events/payment-event.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import {
  PaymentEventResultCode,
  paymentEventResult,
  type PaymentEventResult,
} from '../payment-event-result.js';
import { RenewalPaymentReconciliationPolicy as Reconciliation } from '../renewal-payment/renewal-payment-reconciliation.policy.js';

@Injectable()
export class EnsureRenewalPaymentUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(event: InvoiceFinalizedEvent, ctx: PaymentsTransactionContext): Promise<PaymentEventResult> {
    if (event.payload.billingReason !== 'subscription_cycle')
      return paymentEventResult.ignored(PaymentEventResultCode.UNSUPPORTED_BILLING_REASON);
    const providerSubscriptionId = event.payload.providerSubscriptionId;
    if (!providerSubscriptionId)
      return paymentEventResult.dead(PaymentEventResultCode.SUBSCRIPTION_REFERENCE_MISSING);
    const invoiceConflict = Reconciliation.invoiceConflict(event);
    if (invoiceConflict) return paymentEventResult.dead(invoiceConflict);
    const existing = await this.payments.findByProviderInvoiceId(
      event.provider,
      event.payload.providerInvoiceId,
      ctx,
    );
    if (existing) return this.result(existing, event);

    const sourcePaymentId = event.payload.sourcePaymentId;
    if (!sourcePaymentId)
      throw new RenewalPaymentContextUnavailableError(
        event.payload.providerInvoiceId,
        'SOURCE_METADATA_MISSING',
      );
    const source = await this.payments.findById(sourcePaymentId, ctx);
    if (!source)
      throw new RenewalPaymentContextUnavailableError(
        event.payload.providerInvoiceId,
        'SOURCE_PAYMENT_NOT_FOUND',
      );
    const sourceConflict = Reconciliation.sourceConflict(source, event);
    if (sourceConflict) return paymentEventResult.dead(sourceConflict);
    if (!source.subscriptionId || !source.providerSubscriptionId)
      throw new RenewalPaymentContextUnavailableError(event.payload.providerInvoiceId, 'SOURCE_NOT_LINKED');

    const payment = await this.payments.ensurePendingRenewal(
      {
        userId: source.userId,
        planId: source.planId,
        periodCount: source.periodCount,
        periodUnit: source.periodUnit,
        providerType: event.provider,
        providerInvoiceId: event.payload.providerInvoiceId,
        providerSubscriptionId,
        providerCustomerId: event.payload.customerId ?? source.providerCustomerId,
        subscriptionId: source.subscriptionId,
        amount: event.payload.amount,
        currency: event.payload.currency.toUpperCase() as Currency,
      },
      ctx,
    );
    return this.result(payment, event, source);
  }

  private result(payment: Payment, event: InvoiceFinalizedEvent, source?: Payment): PaymentEventResult {
    const conflict = Reconciliation.paymentConflict(payment, event, source);
    if (conflict) return paymentEventResult.dead(conflict);
    return paymentEventResult.success(PaymentEventResultCode.RENEWAL_ENSURED, payment.id);
  }
}
