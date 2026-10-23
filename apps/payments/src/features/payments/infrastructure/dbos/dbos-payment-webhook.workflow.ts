import { ConfiguredInstance, DBOS, type StepConfig } from '@dbos-inc/dbos-sdk';
import { Injectable, Logger } from '@nestjs/common';
import { PaymentWebhookEnqueueUnavailableError } from '../../../../common/application/errors/payments.error.js';
import type { PaymentEvent } from '../../application/events/payment-event.js';
import { PaymentEventRepository } from '../../application/ports/payment-event.repository.js';
import {
  PaymentWebhookWorkflow,
  type EnqueuePaymentWebhookResult,
} from '../../application/ports/payment-webhook.workflow.js';
import type { PaymentsTransactionContext } from '../../application/ports/payments-unit-of-work.js';
import {
  PaymentEventResultCode,
  PaymentEventResultStatus,
  type PaymentEventResult,
} from '../../application/use-cases/payment-events/payment-event-result.js';
import {
  ApplyPaymentEventUseCase,
  type ApplyPaymentEventParams,
} from '../../application/use-cases/process-payment-webhook/apply-payment-event.use-case.js';
import {
  CreateDeferredProviderSubscriptionUseCase,
  type CreateDeferredProviderSubscriptionParams,
} from '../../application/use-cases/process-payment-webhook/create-deferred-provider-subscription.use-case.js';
import {
  LinkPaymentToSubscriptionUseCase,
  type LinkPaymentToSubscriptionParams,
  type LinkPaymentToSubscriptionResult,
} from '../../application/use-cases/process-payment-webhook/link-payment-to-subscription.use-case.js';
import {
  ScheduleProviderSubscriptionCancellationUseCase,
  type ScheduleProviderSubscriptionCancellationParams,
  type ScheduleProviderSubscriptionCancellationResult,
} from '../../application/use-cases/process-payment-webhook/schedule-provider-subscription-cancellation.use-case.js';
import { PAYMENT_WEBHOOK_QUEUE } from './dbos-lifecycle.service.js';
import { MissingDbosWorkflowContextError } from './dbos-payment-webhook.errors.js';
import {
  PaymentWorkflowAttemptError,
  PaymentWorkflowProcessingStoppedError,
} from './payment-workflow-attempt.error.js';
import {
  classifyPaymentWorkflowError,
  isRetryablePaymentWorkflowError,
  toPaymentEventFailure,
} from './payment-workflow-error.policy.js';
import { PaymentsDbosDataSource } from './payments-dbos.datasource.js';

const paymentWebhookStepRetryOptions = {
  retriesAllowed: true,
  maxAttempts: 10,
  intervalSeconds: 10,
  backoffRate: 2,
  shouldRetry: isRetryablePaymentWorkflowError,
} satisfies StepConfig;

const scheduleProviderSubscriptionCancellationStepOptions = {
  ...paymentWebhookStepRetryOptions,
  name: 'scheduleProviderSubscriptionCancellationStep',
} satisfies StepConfig;

const createDeferredProviderSubscriptionStepOptions = {
  ...paymentWebhookStepRetryOptions,
  name: 'createDeferredProviderSubscriptionStep',
} satisfies StepConfig;

@Injectable()
export class DbosPaymentWebhookWorkflow extends ConfiguredInstance implements PaymentWebhookWorkflow {
  private readonly logger = new Logger(DbosPaymentWebhookWorkflow.name);

  constructor(
    private readonly dataSource: PaymentsDbosDataSource,
    private readonly events: PaymentEventRepository,
    private readonly applyPaymentEvent: ApplyPaymentEventUseCase,
    private readonly linkPaymentToSubscription: LinkPaymentToSubscriptionUseCase,
    private readonly scheduleProviderSubscriptionCancellation: ScheduleProviderSubscriptionCancellationUseCase,
    private readonly createDeferredProviderSubscription: CreateDeferredProviderSubscriptionUseCase,
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
    try {
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
    } catch (error) {
      this.logger.error({
        event: 'payment_webhook_enqueue_failed',
        workflowId,
        providerEventId: event.providerEventId,
        paymentId: event.paymentId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
      // DBOS details must not cross the infrastructure port. A 503 response lets
      // Stripe redeliver the same event with the same durable workflow identity.
      throw new PaymentWebhookEnqueueUnavailableError();
    }

    // startWorkflow resolves after DBOS durably records the execution. The
    // HTTP request does not wait for the workflow's business result.
    return 'RECEIVED';
  }

  // V7 introduces explicit durable application retries; keep V6 registered for existing histories.
  @DBOS.workflow({ name: 'processPaymentWebhookV7', maxRecoveryAttempts: 10 })
  async process(event: PaymentEvent): Promise<void> {
    const workflowId = DBOS.workflowID;
    if (!workflowId) throw new MissingDbosWorkflowContextError();
    const eventId = await this.persistPaymentEventWithRetry({ event, workflowId });
    try {
      const result = await this.runApplicationTransactionWithRetry(
        eventId,
        'applyPaymentWebhook',
        () => this.applyPaymentEvent.execute({ eventId, event }, this.transactionContext()),
        true,
      );
      if (
        result.status !== PaymentEventResultStatus.SUCCESS ||
        result.code !== PaymentEventResultCode.PAYMENT_SUCCEEDED
      )
        return;
      const subscriptionResult = await this.runApplicationTransactionWithRetry(
        eventId,
        'linkPaymentToSubscription',
        () =>
          this.linkPaymentToSubscription.execute(
            { eventId, payment: result.payment },
            this.transactionContext(),
          ),
      );
      if (subscriptionResult.outcome !== 'SCHEDULED') return;
      const cancellation =
        await this.scheduleProviderSubscriptionCancellationAtProviderStep(subscriptionResult);
      await this.runApplicationTransactionWithRetry(
        eventId,
        'recordProviderSubscriptionCancellationScheduled',
        () =>
          this.scheduleProviderSubscriptionCancellation.recordScheduled(
            cancellation,
            this.transactionContext(),
          ),
      );
      const created = await this.createDeferredProviderSubscriptionAtProviderStep(cancellation);
      await this.runApplicationTransactionWithRetry(eventId, 'recordDeferredProviderSubscription', () =>
        this.createDeferredProviderSubscription.recordCreated(
          cancellation,
          created,
          this.transactionContext(),
        ),
      );
    } catch (error) {
      if (error instanceof PaymentWorkflowProcessingStoppedError) return;
      // External provider steps retain their own DBOS step retry policy.
      await this.recordWorkflowFailure({ eventId, workflowId, event }, error);
      if (isRetryablePaymentWorkflowError(error)) throw error;
    }
  }

  private async persistPaymentEventWithRetry(params: {
    event: PaymentEvent;
    workflowId: string;
  }): Promise<string> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.persistPaymentEventStep(params);
      } catch (error) {
        if (!isRetryablePaymentWorkflowError(error) || attempt === 10) throw error;
        await DBOS.sleepSeconds(10 * 2 ** (attempt - 1));
      }
    }
  }

  private async runApplicationTransactionWithRetry<T>(
    eventId: string,
    operation: string,
    action: () => Promise<T>,
    recordAttempt = false,
  ): Promise<T> {
    const maxAttempts = 10;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (recordAttempt) {
          await this.dataSource.runTransaction(
            () => this.events.recordAttempt(eventId, attempt, this.transactionContext()),
            { name: 'recordPaymentWebhookAttempt' },
          );
        }
        return await this.dataSource.runTransaction(
          async () => {
            try {
              return await action();
            } catch (error) {
              // The transaction still rolls back; only safe classification survives durable error replay.
              throw new PaymentWorkflowAttemptError(classifyPaymentWorkflowError(error));
            }
          },
          { name: operation },
        );
      } catch (error) {
        const decision = classifyPaymentWorkflowError(error);
        if (decision.disposition === 'DEAD') {
          await this.dataSource.runTransaction(
            () => this.events.markDead(eventId, decision.failure, this.transactionContext()),
            { name: 'markPaymentWebhookDead' },
          );
          throw new PaymentWorkflowProcessingStoppedError();
        }
        if (decision.disposition === 'RECONCILIATION_REQUIRED' || attempt === maxAttempts) {
          const failure =
            decision.disposition === 'RECONCILIATION_REQUIRED'
              ? decision.failure
              : {
                  code: 'PAYMENT_APPLICATION_RETRIES_EXHAUSTED',
                  message: `${operation}: exhausted ${maxAttempts} attempts; last failure: ${decision.failure.code}`,
                };
          await this.dataSource.runTransaction(
            () => this.events.markReconciliationRequired(eventId, failure, this.transactionContext()),
            { name: 'markPaymentWebhookReconciliationRequired' },
          );
          this.logger.warn({
            event: 'payment_webhook_reconciliation_required',
            eventId,
            operation,
            attempt,
            failureCode: failure.code,
          });
          throw new PaymentWorkflowProcessingStoppedError();
        }
        try {
          await this.dataSource.runTransaction(
            () => this.events.markRetrying(eventId, decision.failure, this.transactionContext()),
            { name: 'markPaymentWebhookRetrying' },
          );
        } catch {
          // A database outage can also prevent the audit update. The durable timer must still be scheduled.
          this.logger.warn({ event: 'payment_webhook_retry_audit_unavailable', eventId, operation, attempt });
        }
        const delaySeconds = 10 * 2 ** (attempt - 1);
        this.logger.warn({
          event: 'payment_webhook_retry_scheduled',
          eventId,
          operation,
          attempt,
          delaySeconds,
          failureCode: decision.failure.code,
        });
        // A checkpointed timer, outside any transaction. Recovery replays completed attempts and timers.
        await DBOS.sleepSeconds(delaySeconds);
      }
    }
    throw new Error('Payment application retry loop ended without an outcome');
  }

  // Durable step order is part of workflow history. V6 adds durable failure
  // classification without changing already recorded V5 histories.
  @DBOS.workflow({ name: 'processPaymentWebhookV6', maxRecoveryAttempts: 10 })
  async processV6(event: PaymentEvent): Promise<void> {
    const workflowId = DBOS.workflowID;
    if (!workflowId) throw new MissingDbosWorkflowContextError();

    const eventId = await this.persistPaymentEventStep({ event, workflowId });
    try {
      const result = await this.applyPaymentEventStep({ eventId, event });
      if (
        result.status === PaymentEventResultStatus.SUCCESS &&
        result.code === PaymentEventResultCode.PAYMENT_SUCCEEDED
      ) {
        const subscriptionResult = await this.linkPaymentToSubscriptionStep({
          eventId,
          payment: result.payment,
        });
        if (subscriptionResult.outcome === 'SCHEDULED') {
          const cancellation = await this.scheduleProviderSubscriptionCancellationStep(subscriptionResult);
          await this.createDeferredProviderSubscriptionStep(cancellation);
        }
      }
    } catch (error) {
      await this.recordWorkflowFailure({ eventId, workflowId, event }, error);
      if (isRetryablePaymentWorkflowError(error)) throw error;
    }
  }

  private async recordWorkflowFailure(
    params: { eventId: string; workflowId: string; event: PaymentEvent },
    error: unknown,
  ): Promise<void> {
    const failure = toPaymentEventFailure(error);
    const isRetryable = isRetryablePaymentWorkflowError(error);
    const details = {
      event: isRetryable ? 'payment_webhook_retry_scheduled' : 'payment_webhook_marked_dead',
      eventId: params.eventId,
      workflowId: params.workflowId,
      providerEventId: params.event.providerEventId,
      paymentId: params.event.paymentId,
      attempt: DBOS.stepStatus?.currentAttempt ?? 1,
      failureCode: failure.code,
      failureMessage: failure.message,
    };
    if (isRetryable) this.logger.warn(details);
    else this.logger.error(details);

    await this.dataSource.runTransaction(
      () =>
        isRetryable
          ? this.events.markRetrying(params.eventId, failure, this.transactionContext())
          : this.events.markDead(params.eventId, failure, this.transactionContext()),
      { name: isRetryable ? 'markPaymentWebhookRetrying' : 'markPaymentWebhookDead' },
    );
  }

  private async persistPaymentEventStep(params: {
    event: PaymentEvent;
    workflowId: string;
  }): Promise<string> {
    const persisted = await this.dataSource.runTransaction(
      () => this.events.saveIfAbsent(params.event, params.workflowId, this.transactionContext()),
      { name: 'persistPaymentWebhook' },
    );
    return persisted.id;
  }

  private async applyPaymentEventStep(params: ApplyPaymentEventParams): Promise<PaymentEventResult> {
    const attempt = DBOS.stepStatus?.currentAttempt ?? 1;
    await this.dataSource.runTransaction(
      () => this.events.recordAttempt(params.eventId, attempt, this.transactionContext()),
      { name: 'recordPaymentWebhookAttempt' },
    );

    return this.dataSource.runTransaction(
      async () => {
        const ctx = this.transactionContext();
        return this.applyPaymentEvent.execute(params, ctx);
      },
      { name: 'applyPaymentWebhook' },
    );
  }

  private async linkPaymentToSubscriptionStep(
    params: LinkPaymentToSubscriptionParams,
  ): Promise<LinkPaymentToSubscriptionResult> {
    return this.dataSource.runTransaction(
      () => this.linkPaymentToSubscription.execute(params, this.transactionContext()),
      { name: 'linkPaymentToSubscription' },
    );
  }

  private async scheduleProviderSubscriptionCancellationStep(
    params: ScheduleProviderSubscriptionCancellationParams,
  ): Promise<ScheduleProviderSubscriptionCancellationResult> {
    const result = await this.scheduleProviderSubscriptionCancellationAtProviderStep(params);
    await this.dataSource.runTransaction(
      () => this.scheduleProviderSubscriptionCancellation.recordScheduled(params, this.transactionContext()),
      { name: 'recordProviderSubscriptionCancellationScheduled' },
    );
    return result;
  }

  @DBOS.step(scheduleProviderSubscriptionCancellationStepOptions)
  private async scheduleProviderSubscriptionCancellationAtProviderStep(
    params: ScheduleProviderSubscriptionCancellationParams,
  ): Promise<ScheduleProviderSubscriptionCancellationResult> {
    return this.scheduleProviderSubscriptionCancellation.scheduleAtProvider(params);
  }

  private async createDeferredProviderSubscriptionStep(
    params: CreateDeferredProviderSubscriptionParams,
  ): Promise<void> {
    const created = await this.createDeferredProviderSubscriptionAtProviderStep(params);
    await this.dataSource.runTransaction(
      () => this.createDeferredProviderSubscription.recordCreated(params, created, this.transactionContext()),
      { name: 'recordDeferredProviderSubscription' },
    );
  }

  @DBOS.step(createDeferredProviderSubscriptionStepOptions)
  private async createDeferredProviderSubscriptionAtProviderStep(
    params: CreateDeferredProviderSubscriptionParams,
  ) {
    return this.createDeferredProviderSubscription.createAtProvider(params);
  }

  private transactionContext(): PaymentsTransactionContext {
    return this.dataSource.client;
  }

  private workflowId(event: PaymentEvent): string {
    return `payment-webhook:${event.provider}:${event.providerEventId}`;
  }
}
