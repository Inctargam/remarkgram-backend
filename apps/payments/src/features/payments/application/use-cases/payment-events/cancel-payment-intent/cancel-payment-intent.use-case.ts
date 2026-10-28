import { Injectable } from '@nestjs/common';
import { CheckoutPurpose, PaymentStatus, PaymentType } from '../../../../domain/payment.entity.js';
import type { PaymentIntentCanceledEvent } from '../../../events/payment-event.js';
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
export class CancelPaymentIntentUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: PaymentIntentCanceledEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    const payment = event.paymentId
      ? await this.payments.findById(event.paymentId, ctx)
      : await this.payments.findByProviderPaymentId(event.provider, event.payload.id, ctx);
    if (!payment) return paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_NOT_FOUND);
    if (payment.providerType !== event.provider)
      return paymentEventResult.dead(PaymentEventRejectionReason.PROVIDER_MISMATCH);
    if (
      payment.type !== PaymentType.PURCHASE ||
      payment.checkoutPurpose !== CheckoutPurpose.SUBSCRIPTION_EXTENSION
    )
      return paymentEventResult.ignored(PaymentEventRejectionReason.INELIGIBLE_PAYMENT);
    if (
      hasProviderReferenceConflict([payment.providerPaymentId, event.payload.id]) ||
      hasProviderReferenceConflict([payment.providerCustomerId, event.payload.customerId])
    )
      return paymentEventResult.dead(PaymentEventRejectionReason.REFERENCE_CONFLICT);
    if (payment.status === PaymentStatus.CANCELED)
      return paymentEventResult.completed(PaymentEventCompletionCode.PAYMENT_CANCELED, payment.id);
    if (![PaymentStatus.CREATED, PaymentStatus.PENDING].includes(payment.status))
      return paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_TERMINAL_STATE);

    const result = await this.payments.cancelPendingPayment(
      {
        paymentId: payment.id,
        providerPaymentId: event.payload.id,
        providerCustomerId: event.payload.customerId,
      },
      ctx,
    );
    return result.outcome === 'CANCELED'
      ? paymentEventResult.completed(PaymentEventCompletionCode.PAYMENT_CANCELED, payment.id)
      : result.outcome === 'REFERENCE_CONFLICT'
        ? paymentEventResult.dead(PaymentEventRejectionReason.REFERENCE_CONFLICT)
        : paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_TERMINAL_STATE);
  }
}
