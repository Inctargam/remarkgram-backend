import { Injectable } from '@nestjs/common';
import { PaymentConfirmationNotAppliedError } from '../../../errors/payment-confirmation-not-applied.error.js';
import type { Currency } from '../../../../../../common/domain/currency.enum.js';
import { PaymentStatus, type Payment } from '../../../../domain/payment.entity.js';
import { RenewalPaymentContextUnavailableError } from '../../../errors/renewal-payment-context-unavailable.error.js';
import type { InvoicePaidEvent } from '../../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import {
  PaymentEventRejectionReason,
  paymentEventResult,
  type PaymentEventResult,
} from '../payment-event-result.js';
import { RenewalPaymentReconciliationPolicy as Reconciliation } from '../renewal-payment/renewal-payment-reconciliation.policy.js';

@Injectable()
export class ConfirmRenewalPaymentUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(event: InvoicePaidEvent, ctx: PaymentsTransactionContext): Promise<PaymentEventResult> {
    if (event.payload.billingReason !== 'subscription_cycle') {
      return paymentEventResult.dead(PaymentEventRejectionReason.UNSUPPORTED_BILLING_REASON);
    }
    const providerSubscriptionId = event.payload.providerSubscriptionId;
    if (!providerSubscriptionId) {
      return paymentEventResult.dead(PaymentEventRejectionReason.SUBSCRIPTION_REFERENCE_MISSING);
    }
    const invoiceConflict = Reconciliation.invoiceConflict(event);
    if (invoiceConflict) {
      return paymentEventResult.dead(invoiceConflict);
    }

    const existing = await this.payments.findByProviderInvoiceId(
      event.provider,
      event.payload.providerInvoiceId,
      ctx,
    );
    if (existing) return this.reconcileAndConfirmRenewalPayment(existing, event, ctx);

    const sourcePaymentId = event.payload.sourcePaymentId;
    if (!sourcePaymentId) {
      throw new RenewalPaymentContextUnavailableError(
        event.payload.providerInvoiceId,
        'SOURCE_METADATA_MISSING',
      );
    }
    const source = await this.payments.findById(sourcePaymentId, ctx);
    if (!source) {
      throw new RenewalPaymentContextUnavailableError(
        event.payload.providerInvoiceId,
        'SOURCE_PAYMENT_NOT_FOUND',
      );
    }
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
        subscriptionId: source.subscriptionId,
        amount: event.payload.amount,
        currency: event.payload.currency.toUpperCase() as Currency,
        providerType: event.provider,
        providerSubscriptionId,
        providerInvoiceId: event.payload.providerInvoiceId,
        providerCustomerId: event.payload.customerId ?? source.providerCustomerId,
      },
      ctx,
    );
    // При отсутствии записи создаём PENDING без paidAt и PaymentIntent ID.
    // Если Payment уже появилась, ensure возвращает её без изменений, включая terminal status.
    // Затем единая обработка проверяет условия и подтверждает оплату по текущему invoice.paid.
    // Создание и подтверждение выполняются в одном tx; ошибка подтверждения откатывает создание.
    return this.reconcileAndConfirmRenewalPayment(payment, event, ctx, source);
  }

  /** Проверяет найденную/полученную через upsert renewal и подтверждает её только при необходимости. */
  private async reconcileAndConfirmRenewalPayment(
    payment: Payment,
    event: InvoicePaidEvent,
    ctx: PaymentsTransactionContext,
    source?: Payment,
  ): Promise<PaymentEventResult> {
    const conflict = Reconciliation.paymentConflict(payment, event, source);
    if (conflict) return paymentEventResult.dead(conflict);
    if (payment.status === PaymentStatus.SUCCEEDED) return paymentEventResult.paymentConfirmed(payment);
    if ([PaymentStatus.FAILED, PaymentStatus.CANCELED].includes(payment.status))
      return paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_TERMINAL_STATE);

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
    if (confirmed.outcome === 'SUCCEEDED') return paymentEventResult.paymentConfirmed(confirmed.payment);
    if (confirmed.outcome === 'REFERENCE_CONFLICT')
      return paymentEventResult.dead(PaymentEventRejectionReason.REFERENCE_CONFLICT);
    throw new PaymentConfirmationNotAppliedError(payment.id);
  }
}
