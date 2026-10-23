import { Injectable } from '@nestjs/common';
import { PaymentPersistenceError } from '../../../../../../common/application/errors/payments.error.js';
import type { Currency } from '../../../../../../common/domain/currency.enum.js';
import { PaymentStatus, type Payment } from '../../../../domain/payment.entity.js';
import { RenewalPaymentContextUnavailableError } from '../../../errors/renewal-payment-context-unavailable.error.js';
import type { InvoicePaidEvent } from '../../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import {
  PaymentEventResultCode,
  paymentEventResult,
  type PaymentEventResult,
} from '../payment-event-result.js';
import { RenewalPaymentReconciliationPolicy as Reconciliation } from '../renewal-payment/renewal-payment-reconciliation.policy.js';

@Injectable()
export class ConfirmRenewalPaymentUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(event: InvoicePaidEvent, ctx: PaymentsTransactionContext): Promise<PaymentEventResult> {
    if (event.payload.billingReason !== 'subscription_cycle')
      return paymentEventResult.dead(PaymentEventResultCode.UNSUPPORTED_BILLING_REASON);
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
    if (existing) return this.confirmPayment(existing, event, ctx);

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

    const persisted = await this.payments.createSuccessfulRenewal(
      {
        userId: source.userId,
        planId: source.planId,
        periodCount: source.periodCount,
        periodUnit: source.periodUnit,
        subscriptionId: source.subscriptionId,
        amount: event.payload.amount,
        currency: event.payload.currency.toUpperCase() as Currency,
        paidAt: event.payload.paidAt,
        providerType: event.provider,
        providerPaymentId: event.payload.providerPaymentId,
        providerSubscriptionId,
        providerInvoiceId: event.payload.providerInvoiceId,
        providerCustomerId: event.payload.customerId ?? source.providerCustomerId,
      },
      ctx,
    );
    if (persisted.outcome === 'REFERENCE_CONFLICT')
      return paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT);
    // The upsert may return a concurrent finalized/paid row. Process it directly, without another lookup.
    return this.confirmPayment(persisted.payment, event, ctx, source);
  }

  private async confirmPayment(
    payment: Payment,
    event: InvoicePaidEvent,
    ctx: PaymentsTransactionContext,
    source?: Payment,
  ): Promise<PaymentEventResult> {
    const conflict = Reconciliation.paymentConflict(payment, event, source);
    if (conflict) return paymentEventResult.dead(conflict);
    if (payment.status === PaymentStatus.SUCCEEDED) return paymentEventResult.successfulPayment(payment);
    if ([PaymentStatus.FAILED, PaymentStatus.CANCELED].includes(payment.status))
      return paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE);

    const confirmed = await this.payments.confirmSuccessfulPayment(
      {
        paymentId: payment.id,
        paidAt: event.payload.paidAt,
        providerInvoiceId: event.payload.providerInvoiceId,
        providerSubscriptionId: event.payload.providerSubscriptionId,
        providerPaymentId: event.payload.providerPaymentId,
        providerCustomerId: event.payload.customerId,
      },
      ctx,
    );
    if (confirmed.outcome === 'SUCCEEDED') return paymentEventResult.successfulPayment(confirmed.payment);
    if (confirmed.outcome === 'REFERENCE_CONFLICT')
      return paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT);
    const latest = confirmed.payment;
    if (!latest)
      throw new RenewalPaymentContextUnavailableError(event.payload.providerInvoiceId, 'PAYMENT_DISAPPEARED');
    const latestConflict = Reconciliation.paymentConflict(latest, event, source);
    if (latestConflict) return paymentEventResult.dead(latestConflict);
    if (latest.status === PaymentStatus.SUCCEEDED) return paymentEventResult.successfulPayment(latest);
    if ([PaymentStatus.FAILED, PaymentStatus.CANCELED].includes(latest.status))
      return paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE);
    throw new PaymentPersistenceError();
  }
}
