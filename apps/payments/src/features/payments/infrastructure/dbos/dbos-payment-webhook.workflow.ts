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
} from '../../application/use-cases/payment-events/payment-event-result.js';
import { ApplyPaymentEventUseCase } from '../../application/use-cases/process-payment-webhook/apply-payment-event.use-case.js';
import {
  CreateDeferredProviderSubscriptionUseCase,
  type CreateDeferredProviderSubscriptionParams,
} from '../../application/use-cases/process-payment-webhook/create-deferred-provider-subscription.use-case.js';
import { LinkPaymentToSubscriptionUseCase } from '../../application/use-cases/process-payment-webhook/link-payment-to-subscription.use-case.js';
import {
  ScheduleProviderSubscriptionCancellationUseCase,
  type ScheduleProviderSubscriptionCancellationParams,
  type ScheduleProviderSubscriptionCancellationResult,
} from '../../application/use-cases/process-payment-webhook/schedule-provider-subscription-cancellation.use-case.js';
import { PAYMENT_WEBHOOK_QUEUE } from './dbos-lifecycle.service.js';
import { MissingDbosWorkflowContextError } from './dbos-payment-webhook.errors.js';
import {
  PaymentWorkflowAttemptError,
  type PaymentWorkflowAttemptFailure,
} from './payment-workflow-attempt.error.js';
import {
  DbosPaymentWebhookRetryService,
  PaymentWebhookRetryError,
  type PaymentWebhookRetryAttempt,
  type PaymentWebhookRetryPolicy,
} from './dbos-payment-webhook-retry.service.js';
import {
  classifyPaymentWorkflowError,
  isRetryablePaymentWorkflowError,
} from './payment-workflow-error.policy.js';
import { PaymentsDbosDataSource } from './payments-dbos.datasource.js';

// Повторы локальной операции: до 10 попыток с паузами 10, 20, 40, ... секунд.
const paymentWebhookApplicationRetryPolicy = {
  maxAttempts: 10,
  initialDelaySeconds: 10,
  backoffRate: 2,
} satisfies PaymentWebhookRetryPolicy;

// Внешние запросы повторяет сам DBOS через @DBOS.step, отдельно от локальных транзакций.
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

/**
 * Координирует обработку webhook: задаёт порядок операций, границы транзакций и итог события.
 * Бизнес-действия выполняют use cases; retry-сервис отвечает только за попытки и ожидание.
 */
@Injectable()
export class DbosPaymentWebhookWorkflow extends ConfiguredInstance implements PaymentWebhookWorkflow {
  private readonly logger = new Logger(DbosPaymentWebhookWorkflow.name);
  private readonly retry = new DbosPaymentWebhookRetryService();

  constructor(
    private readonly dataSource: PaymentsDbosDataSource,
    private readonly events: PaymentEventRepository,
    private readonly applyPaymentEvent: ApplyPaymentEventUseCase,
    private readonly linkPaymentToSubscription: LinkPaymentToSubscriptionUseCase,
    private readonly scheduleProviderSubscriptionCancellation: ScheduleProviderSubscriptionCancellationUseCase,
    private readonly createDeferredProviderSubscription: CreateDeferredProviderSubscriptionUseCase,
  ) {
    // По этому имени DBOS связывает восстанавливаемое выполнение с экземпляром NestJS
    // и его внедрёнными зависимостями.
    super('payment-webhook-workflow');
  }

  async enqueue(event: PaymentEvent): Promise<EnqueuePaymentWebhookResult> {
    const workflowId = this.workflowId(event);
    // Сначала DBOS сохраняет задачу в системной БД. Запись webhook в БД payments
    // создаётся позднее самим process(); HTTP-запрос не ждёт обработки платежа.
    try {
      await DBOS.startWorkflow(this, {
        // Стабильный ID связывает повторные доставки события с одной историей выполнения.
        workflowID: workflowId,
        // При повторной постановке возвращаем существующее выполнение.
        duplicationPolicy: 'return-existing',
        queueName: PAYMENT_WEBHOOK_QUEUE,
        // В DBOS 4.26.10 для return-existing нужен ключ дедупликации очереди.
        // Одинаковые события используют один ключ даже при конкурентной доставке.
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
      // Наружу отдаём application-ошибку без деталей DBOS. Ответ 503 позволяет
      // провайдеру повторить доставку с тем же идентификатором события.
      throw new PaymentWebhookEnqueueUnavailableError();
    }

    // RECEIVED подтверждает сохранение задачи DBOS, а не финансовый успех платежа.
    return 'RECEIVED';
  }

  // maxRecoveryAttempts ограничивает восстановление после сбоев выполнения.
  // Лимиты повторов отдельных операций задаются своими retry-политиками выше.
  @DBOS.workflow({ name: 'processPaymentWebhook', maxRecoveryAttempts: 10 })
  async process(event: PaymentEvent): Promise<void> {
    const workflowId = DBOS.workflowID;
    if (!workflowId) throw new MissingDbosWorkflowContextError();
    // Задача уже сохранена в DBOS, но запись события в payments ещё нужно создать.
    // Временный сбой этой БД требует отдельного повтора saveIfAbsent().
    const eventId = await this.retry
      .run(() => this.persistPaymentEventStep({ event, workflowId }), {
        operation: 'persistPaymentWebhook',
        retry: paymentWebhookApplicationRetryPolicy,
        shouldRetry: isRetryablePaymentWorkflowError,
      })
      .catch((error: unknown) => {
        // Сохранение события не завершилось: нет подтверждённого eventId для записи статуса.
        // Поднимаем исходную причину сбоя в DBOS.
        throw error instanceof PaymentWebhookRetryError ? error.cause : error;
      });
    try {
      // 1. Применяем финансовую семантику события в отдельной локальной транзакции.
      const result = await this.runApplicationTransactionWithRetry(
        eventId,
        'applyPaymentWebhook',
        () => this.applyPaymentEvent.execute({ eventId, event }, this.transactionContext()),
        true, // Счётчик processingAttempts учитывает попытки именно этой операции.
      );
      // Действия с подпиской нужны только после подтверждённой успешной оплаты.
      if (
        result.status !== PaymentEventResultStatus.SUCCESS ||
        result.code !== PaymentEventResultCode.PAYMENT_SUCCEEDED
      )
        return;
      // 2. Применяем успешную оплату к подписке и связываем её с Payment.
      const subscriptionResult = await this.runApplicationTransactionWithRetry(
        eventId,
        'linkPaymentToSubscription',
        () =>
          this.linkPaymentToSubscription.execute(
            { eventId, payment: result.payment },
            this.transactionContext(),
          ),
      );
      // FINISHED означает, что локальная обработка завершена. Для SCHEDULED
      // дополнительно переключаем подписки у платёжного провайдера.
      if (subscriptionResult.outcome !== 'SCHEDULED') return;
      // 3. Внешний запрос выполняется без открытой локальной транзакции.
      // Затем отдельно фиксируем подтверждённый результат в БД payments.
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
      // 4. Создаём будущую подписку у провайдера и отдельно сохраняем её привязки.
      // Повтор локальной записи использует результат уже завершённого provider step.
      const created = await this.createDeferredProviderSubscriptionAtProviderStep(cancellation);
      await this.runApplicationTransactionWithRetry(eventId, 'recordDeferredProviderSubscription', () =>
        this.createDeferredProviderSubscription.recordCreated(
          cancellation,
          created,
          this.transactionContext(),
        ),
      );
    } catch (error) {
      // Обёртка сообщает, какая локальная операция остановилась и на какой попытке.
      // Решение о конечном статусе события принадлежит этому процессу.
      if (error instanceof PaymentWebhookRetryError) {
        const decision = classifyPaymentWorkflowError(error.cause);
        const { operation, attempt } = error;
        // Неповторяемая ошибка: завершаем обработку события без изменения
        // финансового статуса Payment самим workflow.
        if (decision.disposition === 'DEAD') {
          await this.dataSource.runTransaction(
            () => this.events.markDead(eventId, decision.failure, this.transactionContext()),
            { name: 'markPaymentWebhookDead' },
          );
          return;
        }
        // Невосстановимый автоматически контекст или исчерпание повторов требуют
        // reconciliation. Сбой самой записи этого статуса выходит наружу из catch.
        if (decision.disposition === 'RECONCILIATION_REQUIRED' || error.retriesExhausted) {
          const failure =
            decision.disposition === 'RECONCILIATION_REQUIRED'
              ? decision.failure
              : {
                  code: 'PAYMENT_APPLICATION_RETRIES_EXHAUSTED',
                  message: `${operation}: exhausted ${attempt} attempts; last failure: ${decision.failure.code}`,
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
          return;
        }
        throw error;
      }
      // Сюда приходят ошибки вне обёртки локальных операций, в том числе provider steps.
      // Их повторы настроены на @DBOS.step; эта ветка лишь фиксирует полученный исход.
      const decision = classifyPaymentWorkflowError(error);
      await this.recordWorkflowFailure({ eventId, workflowId, event }, decision);
      if (decision.disposition === 'RETRY') throw error;
    }
  }

  /**
   * Связывает retry с локальной транзакцией. Каждая попытка открывает новую транзакцию;
   * контекст БД получается внутри неё. Аудит следующего повтора выполняется после rollback.
   */
  private runApplicationTransactionWithRetry<T>(
    eventId: string,
    operation: string,
    action: () => Promise<T>,
    recordAttempt = false,
  ): Promise<T> {
    return this.retry.run(
      async (attempt) => {
        // Записываем номер попытки отдельно: rollback бизнес-операции не стирает этот аудит.
        if (recordAttempt) {
          await this.dataSource.runTransaction(
            () => this.events.recordAttempt(eventId, attempt, this.transactionContext()),
            { name: 'recordPaymentWebhookAttempt' },
          );
        }
        return this.dataSource.runTransaction(
          async () => {
            try {
              return await action();
            } catch (error) {
              const decision = classifyPaymentWorkflowError(error);
              this.auditOperationFailure({ eventId, operation, attempt, error, decision });
              // DBOS может восстановить ошибку без прототипа исходного класса.
              // Сохраняем безопасное решение классификатора в сериализуемой обёртке;
              // исключение по-прежнему откатывает транзакцию.
              throw new PaymentWorkflowAttemptError(decision);
            }
          },
          { name: operation },
        );
      },
      {
        operation,
        retry: paymentWebhookApplicationRetryPolicy,
        shouldRetry: isRetryablePaymentWorkflowError,
        onRetry: (attempt) => this.recordApplicationRetry(eventId, operation, attempt),
      },
    );
  }

  /**
   * Пишет runtime-аудит до сериализации ошибки DBOS. В webhook inbox сохраняется только
   * безопасная классификация; stack нужен в журнале процесса для диагностики неизвестной причины.
   */
  private auditOperationFailure(params: {
    eventId: string;
    operation: string;
    attempt: number;
    error: unknown;
    decision: PaymentWorkflowAttemptFailure;
  }): void {
    const errorName = params.error instanceof Error ? params.error.name : typeof params.error;
    const errorCode = this.errorCode(params.error);
    const details = {
      event: 'payment_webhook_operation_failed',
      eventId: params.eventId,
      workflowId: DBOS.workflowID,
      operation: params.operation,
      attempt: params.attempt,
      disposition: params.decision.disposition,
      failureCode: params.decision.failure.code,
      errorName,
      ...(errorCode ? { errorCode } : {}),
    };

    if (
      params.decision.failure.code === 'UNEXPECTED_WORKFLOW_ERROR' &&
      params.error instanceof Error
    ) {
      this.logger.error(details, params.error.stack);
      return;
    }
    this.logger.warn(details);
  }

  private errorCode(error: unknown): string | null {
    if (typeof error !== 'object' || error === null || !('code' in error)) return null;
    return typeof error.code === 'string' ? error.code : null;
  }

  // Этот callback только сохраняет аудит; задержку после него планирует retry-сервис.
  private async recordApplicationRetry(
    eventId: string,
    operation: string,
    { error, attempt, delaySeconds }: PaymentWebhookRetryAttempt,
  ): Promise<void> {
    const { failure } = classifyPaymentWorkflowError(error);
    try {
      await this.dataSource.runTransaction(
        () => this.events.markRetrying(eventId, failure, this.transactionContext()),
        { name: 'markPaymentWebhookRetrying' },
      );
    } catch {
      // Недоступность аудита не должна отменить запланированный повтор операции.
      this.logger.warn({ event: 'payment_webhook_retry_audit_unavailable', eventId, operation, attempt });
    }
    this.logger.warn({
      event: 'payment_webhook_retry_scheduled',
      eventId,
      operation,
      attempt,
      delaySeconds,
      failureCode: failure.code,
    });
  }

  // Применяет уже готовую классификацию. Запись RETRYING сама по себе не запускает
  // новую попытку: дальнейшее выполнение зависит от механизма DBOS и вызывающего кода.
  private async recordWorkflowFailure(
    params: { eventId: string; workflowId: string; event: PaymentEvent },
    decision: PaymentWorkflowAttemptFailure,
  ): Promise<void> {
    const { failure } = decision;
    const isRetryable = decision.disposition === 'RETRY';
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

  // Это durable-транзакция datasource, а не @DBOS.step: дубль события не создаёт новую запись.
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

  // Внешний эффект и его результат отслеживает DBOS; локальная фиксация идёт следующим вызовом.
  @DBOS.step(scheduleProviderSubscriptionCancellationStepOptions)
  private async scheduleProviderSubscriptionCancellationAtProviderStep(
    params: ScheduleProviderSubscriptionCancellationParams,
  ): Promise<ScheduleProviderSubscriptionCancellationResult> {
    return this.scheduleProviderSubscriptionCancellation.scheduleAtProvider(params);
  }

  // Создание у провайдера отделено от записи привязок: у них разные границы повторов.
  @DBOS.step(createDeferredProviderSubscriptionStepOptions)
  private async createDeferredProviderSubscriptionAtProviderStep(
    params: CreateDeferredProviderSubscriptionParams,
  ) {
    return this.createDeferredProviderSubscription.createAtProvider(params);
  }

  // Доступен только внутри runTransaction(); между durable-операциями не передаётся.
  private transactionContext(): PaymentsTransactionContext {
    return this.dataSource.client;
  }

  // ID зависит от события провайдера, поэтому повторная доставка использует ту же задачу.
  private workflowId(event: PaymentEvent): string {
    return `payment-webhook:${event.provider}:${event.providerEventId}`;
  }
}
