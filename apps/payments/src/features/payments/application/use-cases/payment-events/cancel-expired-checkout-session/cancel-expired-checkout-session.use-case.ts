import { Injectable } from '@nestjs/common';
import { type Payment, PaymentStatus } from '../../../../domain/payment.entity.js';
import type { CheckoutSessionExpiredEvent } from '../../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import type {
  CancelExpiredCheckoutSessionResult,
  CheckoutReconciliationConflict,
} from '../payment-event-processing.types.js';
import {
  PAYMENT_RECONCILIATION_CONFLICT,
  hasProviderReferenceConflict,
  paymentReconciliationConflictResult,
} from '../payment-reconciliation.policy.js';

@Injectable()
export class CancelExpiredCheckoutSessionUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: CheckoutSessionExpiredEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<CancelExpiredCheckoutSessionResult> {
    const payment = event.paymentId
      ? await this.payments.findById(event.paymentId, ctx)
      : await this.payments.findByProviderCheckoutId(event.provider, event.payload.id, ctx);
    if (!payment) return { outcome: 'PAYMENT_NOT_FOUND' };

    const conflict = this.reconciliationConflict(payment, event);
    if (conflict) return paymentReconciliationConflictResult(conflict);
    if (payment.status === PaymentStatus.CANCELED)
      return { outcome: 'ALREADY_CANCELED', paymentId: payment.id };
    if (![PaymentStatus.CREATED, PaymentStatus.PENDING].includes(payment.status))
      return { outcome: 'INVALID_TRANSITION' };

    const result = await this.payments.cancelPendingPayment(
      {
        paymentId: payment.id,
        providerCheckoutId: event.payload.id,
        providerCustomerId: event.payload.customerId,
      },
      ctx,
    );
    return result.outcome === 'CANCELED' ? { outcome: 'CANCELED', paymentId: payment.id } : result;
  }

  private reconciliationConflict(
    payment: Payment,
    event: CheckoutSessionExpiredEvent,
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
    if (hasProviderReferenceConflict([payment.providerCheckoutId, event.payload.id]))
      return PAYMENT_RECONCILIATION_CONFLICT.REFERENCE_CONFLICT;
    return null;
  }
}
