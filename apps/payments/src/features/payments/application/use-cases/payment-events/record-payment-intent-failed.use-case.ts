import { Injectable } from '@nestjs/common';
import type { PaymentIntentPaymentFailedEvent } from '../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../ports/payments.repository.js';
import type { PaymentEventCorrelationResult } from './payment-event-processing.types.js';

@Injectable()
export class RecordPaymentIntentFailedUseCase {
  constructor(private readonly payments: PaymentsRepository) {}
  // Failure event является audit-событием, а не lifecycle transition
  async execute(
    event: PaymentIntentPaymentFailedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventCorrelationResult> {
    const payment = event.paymentId
      ? await this.payments.findById(event.paymentId, ctx)
      : await this.payments.findByProviderPaymentId(event.provider, event.payload.id, ctx);

    if (!payment || payment.providerType !== event.provider) return { outcome: 'UNCORRELATED' };
    if (payment.providerPaymentId !== null && payment.providerPaymentId !== event.payload.id)
      return { outcome: 'UNCORRELATED' };

    return { outcome: 'CORRELATED', paymentId: payment.id };
  }
}
