import { Injectable } from '@nestjs/common';
import { Payment } from '../../../../domain/payment.entity.js';
import type { CheckoutSessionCompletedEvent } from '../../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import {
  PAYMENT_ID_MISSING_RESULT,
  type ApplyCheckoutCompletedResult,
  type CheckoutReconciliationConflict,
} from '../payment-event-processing.types.js';
import {
  PAYMENT_RECONCILIATION_CONFLICT,
  hasProviderReferenceConflict,
  paymentReconciliationConflictResult,
} from '../payment-reconciliation.policy.js';

@Injectable()
export class ApplyCheckoutSessionCompletedUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: CheckoutSessionCompletedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<ApplyCheckoutCompletedResult> {
    if (!event.paymentId) return PAYMENT_ID_MISSING_RESULT;
    const payment = await this.payments.findById(event.paymentId, ctx);
    if (!payment) return { outcome: 'PAYMENT_NOT_FOUND' };

    const validation = this.validate(payment, event);
    if (validation) return paymentReconciliationConflictResult(validation);
    if (this.isAlreadyApplied(payment, event)) return { outcome: 'ALREADY_APPLIED' };

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
    return this.payments.applyCheckoutCompleted(command, ctx);
  }

  private validate(
    payment: Payment,
    event: CheckoutSessionCompletedEvent,
  ): CheckoutReconciliationConflict | null {
    if (payment.providerType !== event.provider)
      return PAYMENT_RECONCILIATION_CONFLICT.PROVIDER_MISMATCH;
    if (event.payload.amount !== null && payment.amount !== event.payload.amount)
      return PAYMENT_RECONCILIATION_CONFLICT.AMOUNT_MISMATCH;
    if (
      event.payload.currency !== null &&
      payment.currency.toLowerCase() !== event.payload.currency.toLowerCase()
    )
      return PAYMENT_RECONCILIATION_CONFLICT.CURRENCY_MISMATCH;
    if (
      payment.providerCustomerId !== null &&
      event.payload.customerId !== null &&
      payment.providerCustomerId !== event.payload.customerId
    )
      return PAYMENT_RECONCILIATION_CONFLICT.CUSTOMER_MISMATCH;

    const providerObjectReference =
      event.payload.mode === 'subscription'
        ? ([payment.providerSubscriptionId, event.payload.providerSubscriptionId] as const)
        : ([payment.providerPaymentId, event.payload.providerPaymentId] as const);
    return hasProviderReferenceConflict(
      [payment.providerCheckoutId, event.payload.id],
      providerObjectReference,
    )
      ? PAYMENT_RECONCILIATION_CONFLICT.REFERENCE_CONFLICT
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
