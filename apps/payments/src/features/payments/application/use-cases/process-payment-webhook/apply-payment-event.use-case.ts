import { Injectable } from '@nestjs/common';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import type {
  CheckoutSessionCompletedEvent,
  CheckoutSessionExpiredEvent,
  InvoicePaidEvent,
  InvoicePaymentFailedEvent,
  PaymentEvent,
  PaymentIntentCanceledEvent,
  PaymentIntentPaymentFailedEvent,
  PaymentIntentSucceededEvent,
} from '../../events/payment-event.js';
import { PaymentEventRepository } from '../../ports/payment-event.repository.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { ApplyCheckoutSessionCompletedUseCase } from '../payment-events/apply-checkout-session-completed/apply-checkout-session-completed.use-case.js';
import { CancelExpiredCheckoutSessionUseCase } from '../payment-events/cancel-expired-checkout-session/cancel-expired-checkout-session.use-case.js';
import { CancelPaymentIntentUseCase } from '../payment-events/cancel-payment-intent/cancel-payment-intent.use-case.js';
import { ConfirmInvoicePaidUseCase } from '../payment-events/confirm-invoice-paid/confirm-invoice-paid.use-case.js';
import { ConfirmPaymentIntentSucceededUseCase } from '../payment-events/confirm-payment-intent-succeeded/confirm-payment-intent-succeeded.use-case.js';
import {
  PaymentEventResultCode,
  PaymentEventResultStatus,
  paymentEventResult,
  type PaymentEventResult,
} from '../payment-events/payment-event-result.js';
import { RecordInvoicePaymentFailedUseCase } from '../payment-events/record-invoice-payment-failed/record-invoice-payment-failed.use-case.js';
import { RecordPaymentIntentFailedUseCase } from '../payment-events/record-payment-intent-failed/record-payment-intent-failed.use-case.js';

export type ApplyPaymentEventParams = {
  eventId: string;
  event: PaymentEvent;
};

/**
 * Application boundary for the first payment-webhook step.
 *
 * It owns event dispatch and business completion policy. The DBOS workflow owns
 * durability, retries and the transaction in which this use case is called.
 */
@Injectable()
export class ApplyPaymentEventUseCase {
  constructor(
    private readonly events: PaymentEventRepository,
    private readonly applyCheckoutSessionCompleted: ApplyCheckoutSessionCompletedUseCase,
    private readonly cancelExpiredCheckoutSession: CancelExpiredCheckoutSessionUseCase,
    private readonly confirmPaymentIntentSucceeded: ConfirmPaymentIntentSucceededUseCase,
    private readonly confirmInvoicePaid: ConfirmInvoicePaidUseCase,
    private readonly recordPaymentIntentFailed: RecordPaymentIntentFailedUseCase,
    private readonly cancelPaymentIntent: CancelPaymentIntentUseCase,
    private readonly recordInvoicePaymentFailed: RecordInvoicePaymentFailedUseCase,
  ) {}

  async execute(
    params: ApplyPaymentEventParams,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    const { eventId, event } = params;
    const eventKind: string = event.kind;

    let result: PaymentEventResult;
    if (eventKind === (PaymentEventKind.CHECKOUT_SESSION_COMPLETED as string)) {
      result = await this.applyCheckoutSessionCompleted.execute(event as CheckoutSessionCompletedEvent, ctx);
    } else if (eventKind === (PaymentEventKind.CHECKOUT_SESSION_EXPIRED as string)) {
      result = await this.cancelExpiredCheckoutSession.execute(event as CheckoutSessionExpiredEvent, ctx);
    } else if (eventKind === (PaymentEventKind.PAYMENT_INTENT_SUCCEEDED as string)) {
      result = await this.confirmPaymentIntentSucceeded.execute(event as PaymentIntentSucceededEvent, ctx);
    } else if (eventKind === (PaymentEventKind.INVOICE_PAID as string)) {
      result = await this.confirmInvoicePaid.execute(event as InvoicePaidEvent, ctx);
    } else if (eventKind === (PaymentEventKind.PAYMENT_INTENT_PAYMENT_FAILED as string)) {
      result = await this.recordPaymentIntentFailed.execute(event as PaymentIntentPaymentFailedEvent, ctx);
    } else if (eventKind === (PaymentEventKind.PAYMENT_INTENT_CANCELED as string)) {
      result = await this.cancelPaymentIntent.execute(event as PaymentIntentCanceledEvent, ctx);
    } else if (eventKind === (PaymentEventKind.INVOICE_PAYMENT_FAILED as string)) {
      result = await this.recordInvoicePaymentFailed.execute(event as InvoicePaymentFailedEvent, ctx);
    } else {
      result = paymentEventResult.ignored(PaymentEventResultCode.UNSUPPORTED_EVENT_KIND);
    }

    return this.finish(eventId, result, ctx);
  }

  private async finish(
    eventId: string,
    result: PaymentEventResult,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    if (
      result.status === PaymentEventResultStatus.SUCCESS &&
      result.code === PaymentEventResultCode.PAYMENT_SUCCEEDED
    ) {
      return result;
    }
    if (result.status === PaymentEventResultStatus.SUCCESS) {
      if (result.paymentId) await this.events.attachPayment(eventId, result.paymentId, ctx);
      await this.events.markProcessed(eventId, ctx);
      return result;
    }

    const failure = { code: result.code, message: `Payment event processing result: ${result.code}` };
    if (result.status === PaymentEventResultStatus.IGNORED)
      await this.events.markIgnored(eventId, failure, ctx);
    else await this.events.markDead(eventId, failure, ctx);
    return result;
  }
}
