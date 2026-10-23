import { Injectable } from '@nestjs/common';
import type { Payment } from '../../../../domain/payment.entity.js';
import type { InvoicePaymentFailedEvent } from '../../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import {
  PaymentEventResultCode,
  paymentEventResult,
  type PaymentEventResult,
} from '../payment-event-result.js';
import { hasProviderReferenceConflict } from '../payment-reconciliation.policy.js';

@Injectable()
export class RecordInvoicePaymentFailedUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: InvoicePaymentFailedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    console.debug('event:InvoicePaymentFailedEvent ->', event);
    const payment = await this.findPayment(event, ctx);
    return payment
      ? paymentEventResult.success(PaymentEventResultCode.PAYMENT_FAILURE_RECORDED, payment.id)
      : paymentEventResult.success(PaymentEventResultCode.PAYMENT_FAILURE_RECORDED, null);
  }

  private async findPayment(
    event: InvoicePaymentFailedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null> {
    if (event.paymentId) {
      const byMetadata = await this.payments.findById(event.paymentId, ctx);
      if (this.hasCompatibleMetadataReferences(byMetadata, event)) return byMetadata;
    }

    const byInvoice = await this.payments.findByProviderInvoiceId(
      event.provider,
      event.payload.providerInvoiceId,
      ctx,
    );
    if (this.hasCompatibleInvoiceReferences(byInvoice, event)) return byInvoice;

    if (!event.payload.providerSubscriptionId) return null;
    const bySubscription = await this.payments.findByProviderSubscriptionId(
      event.provider,
      event.payload.providerSubscriptionId,
      ctx,
    );
    return this.hasCompatibleSubscriptionContext(bySubscription, event) ? bySubscription : null;
  }

  private hasCompatibleMetadataReferences(
    payment: Payment | null,
    event: InvoicePaymentFailedEvent,
  ): payment is Payment {
    return (
      payment !== null &&
      payment.providerType === event.provider &&
      !hasProviderReferenceConflict(
        [payment.providerInvoiceId, event.payload.providerInvoiceId],
        [payment.providerPaymentId, event.payload.providerPaymentId],
        [payment.providerSubscriptionId, event.payload.providerSubscriptionId],
        [payment.providerCustomerId, event.payload.customerId],
      )
    );
  }

  private hasCompatibleInvoiceReferences(
    payment: Payment | null,
    event: InvoicePaymentFailedEvent,
  ): payment is Payment {
    return (
      payment !== null &&
      payment.providerType === event.provider &&
      !hasProviderReferenceConflict(
        [payment.providerPaymentId, event.payload.providerPaymentId],
        [payment.providerSubscriptionId, event.payload.providerSubscriptionId],
        [payment.providerCustomerId, event.payload.customerId],
      )
    );
  }

  private hasCompatibleSubscriptionContext(
    payment: Payment | null,
    event: InvoicePaymentFailedEvent,
  ): payment is Payment {
    return (
      payment !== null &&
      payment.providerType === event.provider &&
      !hasProviderReferenceConflict(
        [payment.providerSubscriptionId, event.payload.providerSubscriptionId],
        [payment.providerCustomerId, event.payload.customerId],
      )
    );
  }
}
