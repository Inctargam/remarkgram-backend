import { Injectable } from '@nestjs/common';
import { RenewalPaymentContextUnavailableError } from '../../../errors/renewal-payment-context-unavailable.error.js';
import type { InvoiceVoidedEvent } from '../../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import { PaymentStatus, PaymentType } from '../../../../domain/payment.entity.js';
import { hasProviderReferenceConflict } from '../payment-reconciliation.policy.js';
import {
  PaymentEventResultCode,
  paymentEventResult,
  type PaymentEventResult,
} from '../payment-event-result.js';

@Injectable()
export class CancelVoidedInvoiceUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: InvoiceVoidedEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    if (event.payload.billingReason !== 'subscription_cycle')
      return paymentEventResult.ignored(PaymentEventResultCode.UNSUPPORTED_BILLING_REASON);

    const payment = await this.payments.findByProviderInvoiceId(
      event.provider,
      event.payload.providerInvoiceId,
      ctx,
    );
    if (!payment)
      throw new RenewalPaymentContextUnavailableError(
        event.payload.providerInvoiceId,
        'INVOICE_PAYMENT_NOT_FOUND',
      );
    if (payment.providerType !== event.provider)
      return paymentEventResult.dead(PaymentEventResultCode.PROVIDER_MISMATCH);
    if (payment.type !== PaymentType.RENEWAL || payment.checkoutPurpose !== null)
      return paymentEventResult.ignored(PaymentEventResultCode.INELIGIBLE_PAYMENT);
    if (
      hasProviderReferenceConflict(
        [payment.providerInvoiceId, event.payload.providerInvoiceId],
        [payment.providerSubscriptionId, event.payload.providerSubscriptionId],
        [payment.providerCustomerId, event.payload.customerId],
      )
    )
      return paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT);
    if (payment.status === PaymentStatus.CANCELED)
      return paymentEventResult.success(PaymentEventResultCode.PAYMENT_CANCELED, payment.id);
    if (![PaymentStatus.CREATED, PaymentStatus.PENDING].includes(payment.status))
      return paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE);

    const result = await this.payments.cancelPendingPayment(
      {
        paymentId: payment.id,
        providerInvoiceId: event.payload.providerInvoiceId,
        providerCustomerId: event.payload.customerId,
      },
      ctx,
    );
    return result.outcome === 'CANCELED'
      ? paymentEventResult.success(PaymentEventResultCode.PAYMENT_CANCELED, payment.id)
      : result.outcome === 'REFERENCE_CONFLICT'
        ? paymentEventResult.dead(PaymentEventResultCode.REFERENCE_CONFLICT)
        : paymentEventResult.ignored(PaymentEventResultCode.PAYMENT_TERMINAL_STATE);
  }
}
