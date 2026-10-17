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
import { isRetryablePaymentWorkflowError, toPaymentEventFailure } from './payment-workflow-error.policy.js';
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

  // Durable step order is part of workflow history. V6 adds durable failure
  // classification without changing already recorded V5 histories.
  @DBOS.workflow({ name: 'processPaymentWebhookV6', maxRecoveryAttempts: 10 })
  async process(event: PaymentEvent): Promise<void> {
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
