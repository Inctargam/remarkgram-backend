import { PaymentConfirmationNotAppliedError } from '../../../errors/payment-confirmation-not-applied.error.js';
import { Injectable } from '@nestjs/common';
import { CheckoutPurpose, Payment, PaymentStatus, PaymentType } from '../../../../domain/payment.entity.js';
import type { PaymentIntentSucceededEvent } from '../../../events/payment-event.js';
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
export class ConfirmPaymentIntentSucceededUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: PaymentIntentSucceededEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    const payment = event.paymentId
      ? await this.payments.findById(event.paymentId, ctx)
      : await this.payments.findByProviderPaymentId(event.provider, event.payload.id, ctx);

    if (!payment) return paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_NOT_FOUND);
    const reconciliationConflict = this.findReconciliationConflict(payment, event);
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
        providerPaymentId: event.payload.id,
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
    // Retry the whole financial step; reconciliation runs once against a fresh read.
    throw new PaymentConfirmationNotAppliedError(payment.id);
  }

  private findReconciliationConflict(
    payment: Payment,
    event: PaymentIntentSucceededEvent,
  ): PaymentReconciliationConflict | null {
    if (payment.providerType.toLowerCase() !== event.provider.toLowerCase()) {
      return PAYMENT_RECONCILIATION_CONFLICT.PROVIDER_MISMATCH;
    }
    if (
      payment.type !== PaymentType.PURCHASE ||
      payment.checkoutPurpose !== CheckoutPurpose.SUBSCRIPTION_EXTENSION
    ) {
      return PAYMENT_RECONCILIATION_CONFLICT.PURPOSE_MISMATCH;
    }
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
    return hasProviderReferenceConflict([payment.providerPaymentId, event.payload.id])
      ? PAYMENT_RECONCILIATION_CONFLICT.REFERENCE_CONFLICT
      : null;
  }
}
