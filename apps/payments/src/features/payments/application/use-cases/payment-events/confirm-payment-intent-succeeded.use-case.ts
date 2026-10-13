import { Injectable } from '@nestjs/common';
import { CheckoutPurpose, Payment, PaymentStatus, PaymentType } from '../../../domain/payment.entity.js';
import type { PaymentIntentSucceededEvent } from '../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../ports/payments.repository.js';
import type {
  ConfirmSuccessfulPaymentResult,
  PaymentReconciliationConflict,
} from './payment-event-processing.types.js';

@Injectable()
export class ConfirmPaymentIntentSucceededUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: PaymentIntentSucceededEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<ConfirmSuccessfulPaymentResult> {
    const payment = event.paymentId
      ? await this.payments.findById(event.paymentId, ctx)
      : await this.payments.findByProviderPaymentId(event.provider, event.payload.id, ctx);

    if (!payment) return { outcome: 'PAYMENT_NOT_FOUND' };
    const reconciliationConflict = this.findReconciliationConflict(payment, event);
    if (reconciliationConflict) return { outcome: reconciliationConflict };
    if (payment.status === PaymentStatus.SUCCEEDED) return { outcome: 'ALREADY_SUCCEEDED' };
    if (![PaymentStatus.CREATED, PaymentStatus.PENDING].includes(payment.status))
      return { outcome: 'INVALID_TRANSITION' };

    return this.payments.confirmSuccessfulPayment(
      {
        paymentId: payment.id,
        paidAt: event.payload.paidAt,
        providerPaymentId: event.payload.id,
        providerCustomerId: event.payload.customerId,
      },
      ctx,
    );
  }

  private findReconciliationConflict(
    payment: Payment,
    event: PaymentIntentSucceededEvent,
  ): PaymentReconciliationConflict | null {
    if (payment.providerType !== event.provider) return 'PROVIDER_MISMATCH';
    if (
      payment.type !== PaymentType.PURCHASE ||
      payment.checkoutPurpose !== CheckoutPurpose.SUBSCRIPTION_EXTENSION
    )
      return 'PURPOSE_MISMATCH';
    if (payment.amount !== event.payload.amount) return 'AMOUNT_MISMATCH';
    if (payment.currency.toLowerCase() !== event.payload.currency.toLowerCase()) return 'CURRENCY_MISMATCH';
    if (
      payment.providerCustomerId !== null &&
      event.payload.customerId !== null &&
      payment.providerCustomerId !== event.payload.customerId
    )
      return 'CUSTOMER_MISMATCH';

    return payment.providerPaymentId !== null && payment.providerPaymentId !== event.payload.id
      ? 'REFERENCE_CONFLICT'
      : null;
  }
}
