import { Injectable } from '@nestjs/common';
import { PaymentStatus } from '../../../domain/payment.entity.js';
import { PaymentProviderResultMismatchError } from '../../errors/payment-provider.error.js';
import { RenewalPaymentContextUnavailableError } from '../../errors/renewal-payment-context-unavailable.error.js';
import { PaymentEventRepository } from '../../ports/payment-event.repository.js';
import { PaymentProviderPort, type VoidProviderInvoiceResult } from '../../ports/payment-provider.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../ports/payments.repository.js';

export type CloseCanceledSubscriptionInvoiceParams = {
  eventId: string;
  paymentId: string;
  providerInvoiceId: string;
};

export type CloseCanceledSubscriptionInvoiceResult = CloseCanceledSubscriptionInvoiceParams &
  VoidProviderInvoiceResult;

@Injectable()
export class CloseCanceledSubscriptionInvoiceUseCase {
  constructor(
    private readonly provider: PaymentProviderPort,
    private readonly payments: PaymentsRepository,
    private readonly events: PaymentEventRepository,
  ) {}

  async closeAtProvider(
    params: CloseCanceledSubscriptionInvoiceParams,
  ): Promise<CloseCanceledSubscriptionInvoiceResult> {
    const result = await this.provider.voidInvoice({
      providerInvoiceId: params.providerInvoiceId,
      operationId: params.providerInvoiceId,
    });
    if (result.providerInvoiceId !== params.providerInvoiceId)
      throw new PaymentProviderResultMismatchError('void Invoice');
    return { ...params, ...result };
  }

  async recordClosed(
    result: CloseCanceledSubscriptionInvoiceResult,
    ctx: PaymentsTransactionContext,
  ): Promise<void> {
    if (result.status === 'PAID') {
      const payment = await this.payments.findById(result.paymentId, ctx);
      if (payment?.status !== PaymentStatus.SUCCEEDED)
        throw new RenewalPaymentContextUnavailableError(
          result.providerInvoiceId,
          'INVOICE_PAYMENT_NOT_CONFIRMED',
        );
    }
    if (result.status === 'VOIDED') {
      const cancellation = await this.payments.cancelPendingPayment(
        { paymentId: result.paymentId, providerInvoiceId: result.providerInvoiceId },
        ctx,
      );
      if (cancellation.outcome !== 'CANCELED') {
        const payment = await this.payments.findById(result.paymentId, ctx);
        if (payment?.status !== PaymentStatus.CANCELED)
          throw new PaymentProviderResultMismatchError('record voided Invoice cancellation');
      }
    }

    await this.events.attachPayment(result.eventId, result.paymentId, ctx);
    await this.events.markProcessed(result.eventId, ctx);
  }
}
