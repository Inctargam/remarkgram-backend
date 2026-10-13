import { Injectable } from '@nestjs/common';
import type { Payment } from '../../../domain/payment.entity.js';
import type { InvoicePaymentFailedEvent } from '../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../ports/payments.repository.js';
import type { PaymentEventCorrelationResult } from './payment-event-processing.types.js';

@Injectable()
export class RecordInvoicePaymentFailedUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: InvoicePaymentFailedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventCorrelationResult> {
    const payment = await this.findPayment(event, ctx);
    return payment ? { outcome: 'CORRELATED', paymentId: payment.id } : { outcome: 'UNCORRELATED' };
  }

  private async findPayment(
    event: InvoicePaymentFailedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null> {
    if (event.paymentId) {
      const byMetadata = await this.payments.findById(event.paymentId, ctx);
      if (this.hasCompatibleProviderAndSubscription(byMetadata, event)) return byMetadata;
    }

    const byInvoice = await this.payments.findByProviderInvoiceId(
      event.provider,
      event.payload.providerInvoiceId,
      ctx,
    );
    if (byInvoice) return byInvoice;

    if (!event.payload.providerSubscriptionId) return null;
    return this.payments.findByProviderSubscriptionId(
      event.provider,
      event.payload.providerSubscriptionId,
      ctx,
    );
  }

  private hasCompatibleProviderAndSubscription(
    payment: Payment | null,
    event: InvoicePaymentFailedEvent,
  ): payment is Payment {
    return (
      payment !== null &&
      payment.providerType === event.provider &&
      (payment.providerSubscriptionId === null ||
        event.payload.providerSubscriptionId === null ||
        payment.providerSubscriptionId === event.payload.providerSubscriptionId)
    );
  }
}
