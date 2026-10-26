import { Injectable } from '@nestjs/common';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import type { PaymentEvent } from '../../events/payment-event.js';
import { PaymentEventRepository } from '../../ports/payment-event.repository.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { EnsureRenewalPaymentUseCase } from '../payment-events/ensure-renewal-payment/ensure-renewal-payment.use-case.js';
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

type PaymentEventHandlers = {
  readonly [Kind in PaymentEvent['kind']]: {
    execute(
      event: Extract<PaymentEvent, { kind: Kind }>,
      ctx: PaymentsTransactionContext,
    ): Promise<PaymentEventResult>;
  };
};

/**
 * Application boundary for the first payment-webhook step.
 *
 * It owns event dispatch and business completion policy. The DBOS workflow owns
 * durability, retries and the transaction in which this use case is called.
 */
@Injectable()
export class ApplyPaymentEventUseCase {
  private readonly handlers: PaymentEventHandlers;

  constructor(
    private readonly events: PaymentEventRepository,
    applyCheckoutSessionCompleted: ApplyCheckoutSessionCompletedUseCase,
    cancelExpiredCheckoutSession: CancelExpiredCheckoutSessionUseCase,
    confirmPaymentIntentSucceeded: ConfirmPaymentIntentSucceededUseCase,
    confirmInvoicePaid: ConfirmInvoicePaidUseCase,
    recordPaymentIntentFailed: RecordPaymentIntentFailedUseCase,
    cancelPaymentIntent: CancelPaymentIntentUseCase,
    recordInvoicePaymentFailed: RecordInvoicePaymentFailedUseCase,
    ensureRenewalPayment: EnsureRenewalPaymentUseCase,
  ) {
    this.handlers = {
      [PaymentEventKind.CHECKOUT_SESSION_COMPLETED]: applyCheckoutSessionCompleted,
      [PaymentEventKind.CHECKOUT_SESSION_EXPIRED]: cancelExpiredCheckoutSession,
      [PaymentEventKind.PAYMENT_INTENT_SUCCEEDED]: confirmPaymentIntentSucceeded,
      [PaymentEventKind.INVOICE_FINALIZED]: ensureRenewalPayment,
      [PaymentEventKind.INVOICE_PAID]: confirmInvoicePaid,
      [PaymentEventKind.PAYMENT_INTENT_PAYMENT_FAILED]: recordPaymentIntentFailed,
      [PaymentEventKind.PAYMENT_INTENT_CANCELED]: cancelPaymentIntent,
      [PaymentEventKind.INVOICE_PAYMENT_FAILED]: recordInvoicePaymentFailed,
    };
  }

  async execute(
    params: ApplyPaymentEventParams,
    ctx: PaymentsTransactionContext,
  ): Promise<PaymentEventResult> {
    const { eventId, event } = params;
    const result = await this.dispatch(event, ctx);

    return this.finish(eventId, result, ctx);
  }

  private async dispatch(event: PaymentEvent, ctx: PaymentsTransactionContext): Promise<PaymentEventResult> {
    if (!Object.prototype.hasOwnProperty.call(this.handlers, event.kind)) {
      return paymentEventResult.ignored(PaymentEventResultCode.UNSUPPORTED_EVENT_KIND);
    }

    const handler = this.handlers[event.kind];
    // The mapped type checks each registration; TypeScript loses the key/event
    // correlation on dynamic lookup, so the assertion stays at this boundary.
    return handler.execute(event as never, ctx);
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
