import { Injectable } from '@nestjs/common';
import type { PaymentIntentPaymentFailedEvent } from '../../../events/payment-event.js';
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
export class RecordPaymentIntentFailedUseCase {
  constructor(private readonly payments: PaymentsRepository) {}
  // Failure event является audit-событием, а не lifecycle transition
  async execute(
    event: PaymentIntentPaymentFailedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    const payment = event.paymentId
      ? await this.payments.findById(event.paymentId, ctx)
      : await this.payments.findByProviderPaymentId(event.provider, event.payload.id, ctx);

    if (!payment) {
      return paymentEventResult.ignored(PaymentEventRejectionReason.PAYMENT_NOT_FOUND);
    }
    if (payment.providerType !== event.provider)
      return paymentEventResult.dead(PaymentEventRejectionReason.PROVIDER_MISMATCH);
    if (hasProviderReferenceConflict([payment.providerPaymentId, event.payload.id]))
      return paymentEventResult.dead(PaymentEventRejectionReason.REFERENCE_CONFLICT);

    return paymentEventResult.completed(PaymentEventCompletionCode.PAYMENT_FAILURE_RECORDED, payment.id);
  }
}
