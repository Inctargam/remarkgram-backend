import { PaymentConfirmationNotAppliedError } from '../../../errors/payment-confirmation-not-applied.error.js';
import { Injectable } from '@nestjs/common';
import { ConfirmRenewalPaymentUseCase } from '../confirm-renewal-payment/confirm-renewal-payment.use-case.js';
import {
  CheckoutPurpose,
  PaymentStatus,
  PaymentType,
  type Payment,
} from '../../../../domain/payment.entity.js';
import type { InvoicePaidEvent } from '../../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import {
  PaymentEventRejectionReason,
  paymentEventResult,
  type PaymentEventResult,
} from '../payment-event-result.js';
import {
  PAYMENT_RECONCILIATION_CONFLICT,
  hasProviderReferenceConflict,
  type PaymentReconciliationConflict,
} from '../payment-reconciliation.policy.js';

@Injectable()
export class ConfirmInvoicePaidUseCase {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly confirmRenewal: ConfirmRenewalPaymentUseCase,
  ) {}

  async execute(event: InvoicePaidEvent, ctx: PaymentsTransactionContext): Promise<PaymentEventResult> {
    if (event.payload.billingReason === 'subscription_create') return this.confirmInitialPurchase(event, ctx);
    if (event.payload.billingReason === 'subscription_cycle') return this.confirmRenewal.execute(event, ctx);
    return paymentEventResult.dead(PaymentEventRejectionReason.UNSUPPORTED_BILLING_REASON);
  }

  private async confirmInitialPurchase(
    event: InvoicePaidEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    if (!event.payload.providerSubscriptionId) {
      return paymentEventResult.dead(PaymentEventRejectionReason.SUBSCRIPTION_REFERENCE_MISSING);
    }
    const payment = await this.findInitialPurchase(event, ctx);
    if (!payment) {
      return paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_NOT_FOUND);
    }
    const reconciliationConflict = this.findInitialReconciliationConflict(payment, event);
    if (reconciliationConflict) {
      return paymentEventResult.dead(PaymentEventRejectionReason[reconciliationConflict]);
    }
    if (payment.status === PaymentStatus.SUCCEEDED) {
      return paymentEventResult.paymentConfirmed(payment);
    }

    if (![PaymentStatus.CREATED, PaymentStatus.PENDING].includes(payment.status)) {
      return paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_TERMINAL_STATE);
    }

    const result = await this.payments.confirmSuccessfulPayment(
      {
        paymentId: payment.id,
        paidAt: event.payload.paidAt,
        providerPaymentId: event.payload.providerPaymentId,
        providerSubscriptionId: event.payload.providerSubscriptionId,
        providerInvoiceId: event.payload.providerInvoiceId,
        providerCustomerId: event.payload.customerId,
      },
      ctx,
    );
    if (result.outcome === 'SUCCEEDED') {
      return paymentEventResult.paymentConfirmed(result.payment);
    }
    if (result.outcome === 'REFERENCE_CONFLICT') {
      return paymentEventResult.dead(PaymentEventRejectionReason.REFERENCE_CONFLICT);
    }
    throw new PaymentConfirmationNotAppliedError(payment.id);
  }

  private async findInitialPurchase(
    event: InvoicePaidEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null> {
    if (event.paymentId) return this.payments.findById(event.paymentId, ctx);
    const byInvoice = await this.payments.findByProviderInvoiceId(
      event.provider,
      event.payload.providerInvoiceId,
      ctx,
    );
    if (byInvoice) return byInvoice;
    return null;
  }

  private findInitialReconciliationConflict(
    payment: Payment,
    event: InvoicePaidEvent,
  ): PaymentReconciliationConflict | null {
    if (payment.providerType.toLowerCase() !== event.provider.toLowerCase()) {
      return PAYMENT_RECONCILIATION_CONFLICT.PROVIDER_MISMATCH;
    }
    if (
      payment.type !== PaymentType.PURCHASE ||
      payment.checkoutPurpose !== CheckoutPurpose.INITIAL_SUBSCRIPTION
    ) {
      return PAYMENT_RECONCILIATION_CONFLICT.PURPOSE_MISMATCH;
    }
    return this.findFinancialOrReferenceConflict(payment, event);
  }

  private findFinancialOrReferenceConflict(
    payment: Payment,
    event: InvoicePaidEvent,
  ): PaymentReconciliationConflict | null {
    if (payment.amount !== event.payload.amount) {
      return PAYMENT_RECONCILIATION_CONFLICT.AMOUNT_MISMATCH;
    }
    if (payment.currency.toLowerCase() !== event.payload.currency.toLowerCase()) {
      return PAYMENT_RECONCILIATION_CONFLICT.CURRENCY_MISMATCH;
    }
    if (
      payment.providerCustomerId !== null &&
      event.payload.customerId !== null &&
      payment.providerCustomerId !== event.payload.customerId
    ) {
      return PAYMENT_RECONCILIATION_CONFLICT.CUSTOMER_MISMATCH;
    }
    return hasProviderReferenceConflict(
      [payment.providerPaymentId, event.payload.providerPaymentId],
      [payment.providerSubscriptionId, event.payload.providerSubscriptionId],
      [payment.providerInvoiceId, event.payload.providerInvoiceId],
    )
      ? PAYMENT_RECONCILIATION_CONFLICT.REFERENCE_CONFLICT
      : null;
  }
}
