import { Injectable } from '@nestjs/common';
import { Payment } from '../../../../domain/payment.entity.js';
import type { CheckoutSessionCompletedEvent } from '../../../events/payment-event.js';
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
export class ApplyCheckoutSessionCompletedUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: CheckoutSessionCompletedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    if (!event.paymentId) return paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_NOT_FOUND);
    const payment = await this.payments.findById(event.paymentId, ctx);
    if (!payment) return paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_NOT_FOUND);

    const validation = this.validate(payment, event);
    if (validation) {
      const code = PaymentEventRejectionReason[validation];
      return paymentEventResult.dead(code);
    }
    if (this.isAlreadyApplied(payment, event))
      return paymentEventResult.completed(PaymentEventCompletionCode.CHECKOUT_COMPLETED, payment.id);

    const command =
      event.payload.mode === 'subscription'
        ? {
            paymentId: payment.id,
            providerCheckoutId: event.payload.id,
            providerSubscriptionId: event.payload.providerSubscriptionId,
            providerCustomerId: event.payload.customerId,
          }
        : {
            paymentId: payment.id,
            providerCheckoutId: event.payload.id,
            providerPaymentId: event.payload.providerPaymentId,
            providerCustomerId: event.payload.customerId,
          };
    const result = await this.payments.applyCheckoutCompleted(command, ctx);
    return result.outcome === 'APPLIED'
      ? paymentEventResult.completed(PaymentEventCompletionCode.CHECKOUT_COMPLETED, payment.id)
      : paymentEventResult.dead(PaymentEventRejectionReason.REFERENCE_CONFLICT);
  }

  private validate(
    payment: Payment,
    event: CheckoutSessionCompletedEvent,
  ): PaymentEventRejectionReason | null {
    if (payment.providerType.toLowerCase() !== event.provider.toLowerCase())
      return PaymentEventRejectionReason.PROVIDER_MISMATCH;
    if (event.payload.amount !== null && payment.amount !== event.payload.amount)
      return PaymentEventRejectionReason.AMOUNT_MISMATCH;
    if (
      event.payload.currency !== null &&
      payment.currency.toLowerCase() !== event.payload.currency.toLowerCase()
    )
      return PaymentEventRejectionReason.CURRENCY_MISMATCH;
    if (
      payment.providerCustomerId !== null &&
      event.payload.customerId !== null &&
      payment.providerCustomerId !== event.payload.customerId
    )
      return PaymentEventRejectionReason.CUSTOMER_MISMATCH;

    const providerObjectReference =
      event.payload.mode === 'subscription'
        ? ([payment.providerSubscriptionId, event.payload.providerSubscriptionId] as const)
        : ([payment.providerPaymentId, event.payload.providerPaymentId] as const);
    return hasProviderReferenceConflict(
      [payment.providerCheckoutId, event.payload.id],
      providerObjectReference,
    )
      ? PaymentEventRejectionReason.REFERENCE_CONFLICT
      : null;
  }

  private isAlreadyApplied(payment: Payment, event: CheckoutSessionCompletedEvent): boolean {
    return (
      payment.providerCheckoutId === event.payload.id &&
      (event.payload.mode === 'subscription'
        ? event.payload.providerSubscriptionId === null ||
          payment.providerSubscriptionId === event.payload.providerSubscriptionId
        : event.payload.providerPaymentId === null ||
          payment.providerPaymentId === event.payload.providerPaymentId) &&
      (event.payload.customerId === null || payment.providerCustomerId === event.payload.customerId)
    );
  }
}
