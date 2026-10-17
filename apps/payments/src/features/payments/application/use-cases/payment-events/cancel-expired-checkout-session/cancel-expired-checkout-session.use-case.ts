import { Injectable } from '@nestjs/common';
import { type Payment, PaymentStatus } from '../../../../domain/payment.entity.js';
import type { CheckoutSessionExpiredEvent } from '../../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import {
  PaymentEventResultCode,
  paymentEventResult,
  type PaymentEventResult,
} from '../payment-event-result.js';
import {
  PAYMENT_RECONCILIATION_CONFLICT,
  hasProviderReferenceConflict,
  type PaymentReconciliationConflict,
} from '../payment-reconciliation.policy.js';

@Injectable()
export class CancelExpiredCheckoutSessionUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: CheckoutSessionExpiredEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    const payment = event.paymentId
      ? await this.payments.findById(event.paymentId, ctx)
      : await this.payments.findByProviderCheckoutId(event.provider, event.payload.id, ctx);
    if (!payment) return paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_NOT_FOUND);

    const conflict = this.reconciliationConflict(payment, event);
    if (conflict) return paymentEventResult.dead(PaymentEventResultCode[conflict]);
    if (payment.status === PaymentStatus.CANCELED)
      return paymentEventResult.success(PaymentEventResultCode.CHECKOUT_EXPIRED, payment.id);
    if (![PaymentStatus.CREATED, PaymentStatus.PENDING].includes(payment.status))
      return paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE);

    const result = await this.payments.cancelPendingPayment(
      {
        paymentId: payment.id,
        providerCheckoutId: event.payload.id,
        providerCustomerId: event.payload.customerId,
      },
      ctx,
    );
    return result.outcome === 'CANCELED'
      ? paymentEventResult.success(PaymentEventResultCode.CHECKOUT_EXPIRED, payment.id)
      : result.outcome === 'REFERENCE_CONFLICT'
        ? paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT)
        : paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE);
  }

  private reconciliationConflict(
    payment: Payment,
    event: CheckoutSessionExpiredEvent,
  ): PaymentReconciliationConflict | null {
    if (payment.providerType !== event.provider) return PAYMENT_RECONCILIATION_CONFLICT.PROVIDER_MISMATCH;
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
