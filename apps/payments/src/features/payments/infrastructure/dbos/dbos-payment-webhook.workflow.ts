import { ConfiguredInstance, DBOS } from '@dbos-inc/dbos-sdk';
import { Injectable } from '@nestjs/common';
import type {
  CheckoutSessionCompletedEvent,
  InvoicePaymentFailedEvent,
  InvoicePaidEvent,
  PaymentEvent,
  PaymentIntentPaymentFailedEvent,
  PaymentIntentSucceededEvent,
} from '../../application/events/payment-event.js';
import { ConfirmPaymentIntentSucceededUseCase } from '../../application/use-cases/payment-events/confirm-payment-intent-succeeded.use-case.js';
import { ConfirmInvoicePaidUseCase } from '../../application/use-cases/payment-events/confirm-invoice-paid.use-case.js';
import { ApplyCheckoutSessionCompletedUseCase } from '../../application/use-cases/payment-events/apply-checkout-session-completed.use-case.js';
import { RecordPaymentIntentFailedUseCase } from '../../application/use-cases/payment-events/record-payment-intent-failed.use-case.js';
import { RecordInvoicePaymentFailedUseCase } from '../../application/use-cases/payment-events/record-invoice-payment-failed.use-case.js';
import {
  PaymentEventRepository,
  type PaymentEventFailure,
} from '../../application/ports/payment-event.repository.js';
import {
  PaymentWebhookWorkflow,
  type EnqueuePaymentWebhookResult,
} from '../../application/ports/payment-webhook.workflow.js';
import type { PaymentsTransactionContext } from '../../application/ports/payments-unit-of-work.js';
import type {
  ApplyCheckoutCompletedResult,
  ConfirmSuccessfulPaymentResult,
} from '../../application/use-cases/payment-events/payment-event-processing.types.js';
import { PaymentEventKind } from '../../domain/payment-event-kind.js';
import { PAYMENT_WEBHOOK_QUEUE } from './dbos-lifecycle.service.js';
import { PaymentsDbosDataSource } from './payments-dbos.datasource.js';

const MAX_ATTEMPTS = 10;
const INITIAL_RETRY_DELAY_SECONDS = 10;
const MAX_RETRY_DELAY_SECONDS = 2_560;

type AttemptResult = 'FINISHED' | 'RETRY';

@Injectable()
export class DbosPaymentWebhookWorkflow extends ConfiguredInstance implements PaymentWebhookWorkflow {
  constructor(
    private readonly dataSource: PaymentsDbosDataSource,
    private readonly events: PaymentEventRepository,
    private readonly applyCheckoutSessionCompleted: ApplyCheckoutSessionCompletedUseCase,
    private readonly confirmPaymentIntentSucceeded: ConfirmPaymentIntentSucceededUseCase,
    private readonly confirmInvoicePaid: ConfirmInvoicePaidUseCase,
    private readonly recordPaymentIntentFailed: RecordPaymentIntentFailedUseCase,
    private readonly recordInvoicePaymentFailed: RecordInvoicePaymentFailedUseCase,
  ) {
    // DBOS uses this stable instance name to reconnect recovered workflows to
    // the NestJS object containing their injected dependencies.
    super('payment-webhook-workflow');
  }

  async enqueue(event: PaymentEvent): Promise<EnqueuePaymentWebhookResult> {
    const workflowId = this.workflowId(event);
    /** 
     *  возвращается после записи workflow в системную БД DBOS. 
     * Поэтому HTTP endpoint не ждёт изменения `Payment`, но к моменту ответа DBOS уже принял ответственность за дальнейшее выполнение.
     *  
     * Это устраняет опасный промежуток классического inbox-подхода:
        INSERT payment_webhooks → COMMIT → падение процесса → запуск worker не состоялся

        В новой схеме сначала durable создаётся workflow. Запись `PaymentWebhook` создаёт уже сам workflow.
     */
    await DBOS.startWorkflow(this, {
      // workflowID связывает событие с одной durable-историей: после падения DBOS
      // продолжит именно это выполнение, а не создаст новую обработку webhook.
      workflowID: workflowId,
      // return-existing предписывает при повторной постановке вернуть handle уже
      // существующего workflow вместо ошибки о занятом deduplication slot.
      duplicationPolicy: 'return-existing',
      queueName: PAYMENT_WEBHOOK_QUEUE,
      // В DBOS 4.26.10 политика return-existing требует deduplicationID.
      // Он резервирует для provider event одно место в очереди и не позволяет
      // конкурентным повторным доставкам Stripe создать две фоновые задачи.
      enqueueOptions: { deduplicationID: workflowId },
    }).process(event);

    // startWorkflow resolves after DBOS durably records the execution. The
    // HTTP request does not wait for the workflow's business result.
    return 'RECEIVED';
  }

  @DBOS.workflow({ name: 'processPaymentWebhookV1', maxRecoveryAttempts: 10 })
  async process(event: PaymentEvent): Promise<void> {
    const workflowId = DBOS.workflowID;
    if (!workflowId) throw new Error('Payment webhook workflow has no DBOS workflow ID');

    const eventId = await this.persistWithRetry(event, workflowId);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.applyAttempt(eventId, event, attempt);
        if (result === 'FINISHED') return;
      } catch (error) {
        const failure = { code: 'PROCESSING_ERROR', message: this.errorMessage(error) };
        DBOS.logger.error(
          `Payment webhook attempt failed; workflowId=${workflowId}; attempt=${attempt}: ${failure.message}`,
        );
        await this.recordInfrastructureFailure(eventId, attempt, failure);
      }

      if (attempt < MAX_ATTEMPTS) await DBOS.sleepSeconds(this.retryDelaySeconds(attempt));
    }
  }

  private async persistWithRetry(event: PaymentEvent, workflowId: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const persisted = await this.dataSource.runTransaction(
          () => this.events.saveIfAbsent(event, workflowId, this.transactionContext()),
          { name: 'persistPaymentWebhook' },
        );
        return persisted.id;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS) await DBOS.sleepSeconds(this.retryDelaySeconds(attempt));
      }
    }
    throw lastError;
  }

  private async applyAttempt(eventId: string, event: PaymentEvent, attempt: number): Promise<AttemptResult> {
    return this.dataSource.runTransaction(
      async () => {
        const ctx = this.transactionContext();
        await this.events.recordAttempt(eventId, attempt, ctx);
        const eventKind: string = event.kind;

        if (eventKind === (PaymentEventKind.CHECKOUT_SESSION_COMPLETED as string)) {
          const result = await this.applyCheckoutSessionCompleted.execute(
            event as CheckoutSessionCompletedEvent,
            ctx,
          );
          return this.finishCheckoutCompleted(eventId, result, ctx);
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
          if (result.outcome === 'CORRELATED')
            await this.events.attachPayment(eventId, result.paymentId, ctx);
          await this.events.markProcessed(eventId, ctx);
          return 'FINISHED';
        }

        if (eventKind === (PaymentEventKind.INVOICE_PAYMENT_FAILED as string)) {
          const result = await this.recordInvoicePaymentFailed.execute(
            event as InvoicePaymentFailedEvent,
            ctx,
          );
          if (result.outcome === 'CORRELATED')
            await this.events.attachPayment(eventId, result.paymentId, ctx);
          await this.events.markProcessed(eventId, ctx);
          return 'FINISHED';
        }

        await this.events.markIgnored(
          eventId,
          { code: 'UNSUPPORTED_EVENT_KIND', message: `Unsupported payment event kind: ${eventKind}` },
          ctx,
        );
        return 'FINISHED';
      },
      { name: 'applyPaymentWebhook' },
    );
  }

  private async finishCheckoutCompleted(
    eventId: string,
    result: ApplyCheckoutCompletedResult,
    ctx: PaymentsTransactionContext,
  ): Promise<AttemptResult> {
    if (result.outcome === 'APPLIED' || result.outcome === 'ALREADY_APPLIED') {
      await this.events.markProcessed(eventId, ctx);
      return 'FINISHED';
    }
    if (result.outcome === 'PAYMENT_NOT_FOUND') {
      // A local Payment is created before checkout starts, so this is not an
      // eventual-consistency case. The provider event refers to a Payment that
      // has already been removed (for example, an old webhook delivery).
      await this.events.markIgnored(
        eventId,
        { code: result.outcome, message: 'Webhook refers to a local payment that no longer exists' },
        ctx,
      );
      return 'FINISHED';
    }
    await this.events.markDead(
      eventId,
      { code: result.outcome, message: `Checkout completion rejected: ${result.outcome}` },
      ctx,
    );
    return 'FINISHED';
  }

  private async finishSuccessfulPayment(
    eventId: string,
    result: ConfirmSuccessfulPaymentResult,
    ctx: PaymentsTransactionContext,
  ): Promise<AttemptResult> {
    if (result.outcome === 'SUCCEEDED' || result.outcome === 'ALREADY_SUCCEEDED') {
      await this.events.markProcessed(eventId, ctx);
      return 'FINISHED';
    }
    if (result.outcome === 'INVALID_TRANSITION') {
      await this.events.markIgnored(
        eventId,
        { code: result.outcome, message: 'Late successful event cannot change a terminal payment' },
        ctx,
      );
      return 'FINISHED';
    }
    if (result.outcome === 'PAYMENT_NOT_FOUND') {
      // See finishCheckoutCompleted: checkout cannot exist before its local
      // Payment, therefore retrying cannot make this historical event applicable.
      await this.events.markIgnored(
        eventId,
        { code: result.outcome, message: 'Webhook refers to a local payment that no longer exists' },
        ctx,
      );
      return 'FINISHED';
    }
    await this.events.markDead(
      eventId,
      { code: result.outcome, message: `Successful payment event rejected: ${result.outcome}` },
      ctx,
    );
    return 'FINISHED';
  }

  private async recordInfrastructureFailure(
    eventId: string,
    attempt: number,
    failure: PaymentEventFailure,
  ): Promise<void> {
    await this.dataSource.runTransaction(
      async () => {
        const ctx = this.transactionContext();
        await this.events.recordAttempt(eventId, attempt, ctx);
        if (attempt >= MAX_ATTEMPTS) await this.events.markDead(eventId, failure, ctx);
        else await this.events.markRetrying(eventId, failure, ctx);
      },
      { name: 'recordPaymentWebhookFailure' },
    );
  }

  private transactionContext(): PaymentsTransactionContext {
    return this.dataSource.client;
  }

  private workflowId(event: PaymentEvent): string {
    return `payment-webhook:${event.provider}:${event.providerEventId}`;
  }

  private retryDelaySeconds(attempt: number): number {
    return Math.min(INITIAL_RETRY_DELAY_SECONDS * 2 ** (attempt - 1), MAX_RETRY_DELAY_SECONDS);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
