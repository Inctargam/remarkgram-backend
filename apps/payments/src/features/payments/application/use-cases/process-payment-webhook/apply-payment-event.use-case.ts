import { Injectable } from '@nestjs/common';
import { PaymentEventKind } from '../../../domain/payment-event-kind.js';
import type {
  CheckoutSessionCompletedEvent,
  CheckoutSessionExpiredEvent,
  InvoicePaidEvent,
  InvoicePaymentFailedEvent,
  PaymentEvent,
  PaymentIntentPaymentFailedEvent,
  PaymentIntentSucceededEvent,
} from '../../events/payment-event.js';
import { PaymentEventRepository, type PaymentEventFailure } from '../../ports/payment-event.repository.js';
import type { PaymentsTransactionContext } from '../../ports/payments-unit-of-work.js';
import { ApplyCheckoutSessionCompletedUseCase } from '../payment-events/apply-checkout-session-completed/apply-checkout-session-completed.use-case.js';
import { CancelExpiredCheckoutSessionUseCase } from '../payment-events/cancel-expired-checkout-session/cancel-expired-checkout-session.use-case.js';
import { ConfirmInvoicePaidUseCase } from '../payment-events/confirm-invoice-paid/confirm-invoice-paid.use-case.js';
import { ConfirmPaymentIntentSucceededUseCase } from '../payment-events/confirm-payment-intent-succeeded/confirm-payment-intent-succeeded.use-case.js';
import type {
  ApplyCheckoutCompletedResult,
  CancelExpiredCheckoutSessionResult,
  ConfirmSuccessfulPaymentResult,
} from '../payment-events/payment-event-processing.types.js';
import { RecordInvoicePaymentFailedUseCase } from '../payment-events/record-invoice-payment-failed/record-invoice-payment-failed.use-case.js';
import { RecordPaymentIntentFailedUseCase } from '../payment-events/record-payment-intent-failed/record-payment-intent-failed.use-case.js';
import type { ApplyPaymentEventResult } from './payment-webhook-processing.types.js';
import { createSuccessfulPayment } from './successful-payment.factory.js';

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
    private readonly recordInvoicePaymentFailed: RecordInvoicePaymentFailedUseCase,
  ) {}

  async execute(
    params: ApplyPaymentEventParams,
    ctx: PaymentsTransactionContext,
  ): Promise<ApplyPaymentEventResult> {
    const { eventId, event } = params;
    const eventKind: string = event.kind;

    if (eventKind === (PaymentEventKind.CHECKOUT_SESSION_COMPLETED as string)) {
      const result = await this.applyCheckoutSessionCompleted.execute(
        event as CheckoutSessionCompletedEvent,
        ctx,
      );
      await this.finishCheckoutCompleted(eventId, result, ctx);
      return { outcome: 'FINISHED' };
    }

    if (eventKind === (PaymentEventKind.CHECKOUT_SESSION_EXPIRED as string)) {
      const result = await this.cancelExpiredCheckoutSession.execute(
        event as CheckoutSessionExpiredEvent,
        ctx,
      );
      await this.finishCheckoutExpired(eventId, result, ctx);
      return { outcome: 'FINISHED' };
    }

    if (eventKind === (PaymentEventKind.PAYMENT_INTENT_SUCCEEDED as string)) {
      const result = await this.confirmPaymentIntentSucceeded.execute(
        event as PaymentIntentSucceededEvent,
        ctx,
      );
      return this.finishSuccessfulPayment(eventId, result, ctx);
    }

    if (eventKind === (PaymentEventKind.INVOICE_PAID as string)) {
      const result = await this.confirmInvoicePaid.execute(event as InvoicePaidEvent, ctx);
      return this.finishSuccessfulPayment(eventId, result, ctx);
    }

    if (eventKind === (PaymentEventKind.PAYMENT_INTENT_PAYMENT_FAILED as string)) {
      const result = await this.recordPaymentIntentFailed.execute(
        event as PaymentIntentPaymentFailedEvent,
        ctx,
      );
      if (result.outcome === 'CORRELATED') await this.events.attachPayment(eventId, result.paymentId, ctx);
      await this.events.markProcessed(eventId, ctx);
      return { outcome: 'FINISHED' };
    }

    if (eventKind === (PaymentEventKind.INVOICE_PAYMENT_FAILED as string)) {
      const result = await this.recordInvoicePaymentFailed.execute(event as InvoicePaymentFailedEvent, ctx);
      if (result.outcome === 'CORRELATED') await this.events.attachPayment(eventId, result.paymentId, ctx);
      await this.events.markProcessed(eventId, ctx);
      return { outcome: 'FINISHED' };
    }

    await this.events.markIgnored(
      eventId,
      { code: 'UNSUPPORTED_EVENT_KIND', message: `Unsupported payment event kind: ${eventKind}` },
      ctx,
    );
    return { outcome: 'FINISHED' };
  }

  private async finishCheckoutCompleted(
    eventId: string,
    result: ApplyCheckoutCompletedResult,
    ctx: PaymentsTransactionContext,
  ): Promise<void> {
    if (result.outcome === 'APPLIED' || result.outcome === 'ALREADY_APPLIED') {
      await this.events.markProcessed(eventId, ctx);
      return;
    }
    if (result.outcome === 'PAYMENT_NOT_FOUND') {
      await this.events.markIgnored(
        eventId,
        { code: result.outcome, message: 'Webhook refers to a local payment that no longer exists' },
        ctx,
      );
      return;
    }
    await this.markDead(
      eventId,
      { code: result.outcome, message: `Checkout completion rejected: ${result.outcome}` },
      ctx,
    );
  }

  private async finishSuccessfulPayment(
    eventId: string,
    result: ConfirmSuccessfulPaymentResult,
    ctx: PaymentsTransactionContext,
  ): Promise<ApplyPaymentEventResult> {
    if (result.outcome === 'SUCCEEDED' || result.outcome === 'ALREADY_SUCCEEDED') {
      return {
        outcome: 'SUCCESSFUL_PAYMENT',
        eventId,
        payment: createSuccessfulPayment(result.payment),
      };
    }
    if (result.outcome === 'INVALID_TRANSITION') {
      await this.events.markIgnored(
        eventId,
        { code: result.outcome, message: 'Late successful event cannot change a terminal payment' },
        ctx,
      );
      return { outcome: 'FINISHED' };
    }
    if (result.outcome === 'PAYMENT_NOT_FOUND') {
      await this.events.markIgnored(
        eventId,
        { code: result.outcome, message: 'Webhook refers to a local payment that no longer exists' },
        ctx,
      );
      return { outcome: 'FINISHED' };
    }
    await this.markDead(
      eventId,
      { code: result.outcome, message: `Successful payment event rejected: ${result.outcome}` },
      ctx,
    );
    return { outcome: 'FINISHED' };
  }

  private async finishCheckoutExpired(
    eventId: string,
    result: CancelExpiredCheckoutSessionResult,
    ctx: PaymentsTransactionContext,
  ): Promise<void> {
    if (result.outcome === 'CANCELED' || result.outcome === 'ALREADY_CANCELED') {
      await this.events.attachPayment(eventId, result.paymentId, ctx);
      await this.events.markProcessed(eventId, ctx);
      return;
    }
    if (result.outcome === 'PAYMENT_NOT_FOUND' || result.outcome === 'INVALID_TRANSITION') {
      await this.events.markIgnored(
        eventId,
        {
          code: result.outcome,
          message:
            result.outcome === 'PAYMENT_NOT_FOUND'
              ? 'Expired Checkout Session has no local payment'
              : 'Expired Checkout Session cannot cancel a terminal payment',
        },
        ctx,
      );
      return;
    }
    await this.markDead(
      eventId,
      { code: result.outcome, message: `Checkout expiration rejected: ${result.outcome}` },
      ctx,
    );
  }

  private markDead(
    eventId: string,
    failure: PaymentEventFailure,
    ctx: PaymentsTransactionContext,
  ): Promise<void> {
    return this.events.markDead(eventId, failure, ctx);
  }
}
