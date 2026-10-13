import { Injectable } from '@nestjs/common';
import { CheckoutPurpose, Payment } from '../../../domain/payment.entity.js';
import type { CheckoutSessionCompletedEvent } from '../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../ports/payments.repository.js';
import type {
  ApplyCheckoutCompletedResult,
  CheckoutReconciliationConflict,
} from './payment-event-processing.types.js';

@Injectable()
export class ApplyCheckoutSessionCompletedUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: CheckoutSessionCompletedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<ApplyCheckoutCompletedResult> {
    if (!event.paymentId) return { outcome: 'PAYMENT_ID_MISSING' };
    const payment = await this.payments.findById(event.paymentId, ctx);
    if (!payment) return { outcome: 'PAYMENT_NOT_FOUND' };

    const validation = this.validate(payment, event);
    if (validation) return { outcome: validation };
    if (this.isAlreadyApplied(payment, event)) return { outcome: 'ALREADY_APPLIED' };

    return this.payments.applyCheckoutCompleted(
      {
        paymentId: payment.id,
        providerCheckoutId: event.payload.id,
        providerPaymentId: event.payload.providerPaymentId,
        providerSubscriptionId: event.payload.providerSubscriptionId,
        providerInvoiceId: event.payload.providerInvoiceId,
        providerCustomerId: event.payload.customerId,
      },
      ctx,
    );
  }

  private validate(
    payment: Payment,
    event: CheckoutSessionCompletedEvent,
  ): CheckoutReconciliationConflict | null {
    if (payment.providerType !== event.provider) return 'PROVIDER_MISMATCH';
    const expectedMode =
      payment.checkoutPurpose === CheckoutPurpose.INITIAL_SUBSCRIPTION ? 'subscription' : 'payment';
    if (event.payload.mode !== null && event.payload.mode !== expectedMode)
      return 'CHECKOUT_MODE_MISMATCH';
    if (event.payload.amount !== null && payment.amount !== event.payload.amount)
      return 'AMOUNT_MISMATCH';
    if (
      event.payload.currency !== null &&
      payment.currency.toLowerCase() !== event.payload.currency.toLowerCase()
    )
      return 'CURRENCY_MISMATCH';
    if (
      payment.providerCustomerId !== null &&
      event.payload.customerId !== null &&
      payment.providerCustomerId !== event.payload.customerId
    )
      return 'CUSTOMER_MISMATCH';

    const references = [
      [payment.providerCheckoutId, event.payload.id],
      [payment.providerPaymentId, event.payload.providerPaymentId],
      [payment.providerSubscriptionId, event.payload.providerSubscriptionId],
      [payment.providerInvoiceId, event.payload.providerInvoiceId],
    ] as const;
    return references.some(([current, incoming]) => current !== null && incoming !== null && current !== incoming)
      ? 'REFERENCE_CONFLICT'
      : null;
  }

  private isAlreadyApplied(payment: Payment, event: CheckoutSessionCompletedEvent): boolean {
    return (
      payment.providerCheckoutId === event.payload.id &&
      (event.payload.providerPaymentId === null || payment.providerPaymentId === event.payload.providerPaymentId) &&
      (event.payload.providerSubscriptionId === null ||
        payment.providerSubscriptionId === event.payload.providerSubscriptionId) &&
      (event.payload.providerInvoiceId === null || payment.providerInvoiceId === event.payload.providerInvoiceId) &&
      (event.payload.customerId === null || payment.providerCustomerId === event.payload.customerId)
    );
  }
}
