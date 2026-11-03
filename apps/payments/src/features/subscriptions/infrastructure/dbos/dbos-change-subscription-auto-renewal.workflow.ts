import { ConfiguredInstance, DBOS, type StepConfig } from '@dbos-inc/dbos-sdk';
import { Injectable, Logger } from '@nestjs/common';
import { PaymentsDbosDataSource } from '../../../payments/infrastructure/dbos/payments-dbos.datasource.js';
import { PaymentsErrorCode } from '../../../../common/domain/errors/payments.error.js';
import { ChangeSubscriptionAutoRenewalWorkflow } from '../../application/ports/change-subscription-auto-renewal.workflow.js';
import { ProviderSubscriptionAutoRenewalGateway } from '../../application/ports/provider-subscription-auto-renewal.gateway.js';
import {
  SubscriptionAutoRenewalConflictError,
  SubscriptionAutoRenewalIdempotencyConflictError,
} from '../../application/errors/subscription-auto-renewal.errors.js';
import type {
  ChangeSubscriptionAutoRenewalResult,
  ChangeSubscriptionAutoRenewalWorkflowParams,
  PreparedSubscriptionAutoRenewalChange,
  ChangeSubscriptionAutoRenewalInput,
  SubscriptionAutoRenewalOperationParams,
} from '../../application/types/subscription-auto-renewal.types.js';
import { SubscriptionsRepository } from '../../application/ports/subscriptions.repository.js';
import type { AutoRenewalOperation } from '../../application/types/subscriptions.types.js';
import { AutoRenewalOperationStatus } from '../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalOperationType } from '../../domain/enums/auto-renewal-operation-type.enum.js';
import { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';
import {
  getAutoRenewalWorkflowErrorCode,
  restoreAutoRenewalWorkflowError,
} from './auto-renewal-workflow-error.mapper.js';

// Повторяем только временные ошибки и вызовы с неизвестным результатом.
const retryableProviderErrorCodes = new Set<string>([
  PaymentsErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
  PaymentsErrorCode.PAYMENT_PROVIDER_OUTCOME_UNKNOWN,
]);

const providerStepOptions = {
  name: 'changeSubscriptionAutoRenewalAtProviderV1',
  retriesAllowed: true,
  maxAttempts: 10,
  intervalSeconds: 10,
  backoffRate: 2,
  shouldRetry: (error: unknown) => retryableProviderErrorCodes.has(getAutoRenewalWorkflowErrorCode(error)),
} satisfies StepConfig;

@Injectable()
export class DbosChangeSubscriptionAutoRenewalWorkflow
  extends ConfiguredInstance
  implements ChangeSubscriptionAutoRenewalWorkflow
{
  private readonly logger = new Logger(DbosChangeSubscriptionAutoRenewalWorkflow.name);

  constructor(
    private readonly dataSource: PaymentsDbosDataSource,
    private readonly paymentsAutoRenewalGateway: ProviderSubscriptionAutoRenewalGateway,
    private readonly subscriptions: SubscriptionsRepository,
  ) {
    super('change-subscription-auto-renewal-workflow');
  }

  async execute(
    params: ChangeSubscriptionAutoRenewalWorkflowParams,
  ): Promise<ChangeSubscriptionAutoRenewalResult> {
    const { workflowId, ...input } = params;

    try {
      // Тот же workflowId возвращает уже начатый процесс.
      const handle = await DBOS.startWorkflow(this, { workflowID: workflowId }).changeAutoRenewal(input);

      // Один ключ нельзя использовать с другой подпиской или другим действием.
      const status = await handle.getStatus();
      if (status?.input === undefined) throw new Error('Auto-renewal workflow has no saved input');

      const [saved] = status.input as [ChangeSubscriptionAutoRenewalInput];
      if (
        saved.userId !== input.userId ||
        saved.subscriptionId !== input.subscriptionId ||
        saved.autoRenewalEnabled !== input.autoRenewalEnabled
      ) {
        throw new SubscriptionAutoRenewalIdempotencyConflictError();
      }

      return await handle.getResult();
    } catch (error) {
      // Восстанавливаем application-ошибку после сериализации DBOS.
      throw restoreAutoRenewalWorkflowError(error);
    }
  }

  // При восстановлении DBOS использует сохранённые UUID и результаты завершённых шагов.
  @DBOS.workflow({ name: 'changeSubscriptionAutoRenewalV1', maxRecoveryAttempts: 100 })
  async changeAutoRenewal(
    input: ChangeSubscriptionAutoRenewalInput,
  ): Promise<ChangeSubscriptionAutoRenewalResult> {
    const operationId = await DBOS.randomUUID();
    const params = { ...input, operationId };

    try {
      const prepared = await this.prepare(params);

      // Уже установленная настройка не требует вызова провайдера.
      if (prepared.completed) {
        return {
          operationId,
          subscriptionId: prepared.subscriptionId,
          autoRenewalEnabled: prepared.autoRenewalEnabled,
        };
      }

      // Внешний вызов выполняется между двумя локальными транзакциями.
      await this.changeAtProvider(prepared);
      return await this.confirm(params);
    } catch (error) {
      this.logger.error({
        event: 'subscription_auto_renewal_failed',
        workflowId: DBOS.workflowID,
        operationId,
        code: getAutoRenewalWorkflowErrorCode(error),
      });

      // Не снимаем переходное состояние: ошибка не доказывает, что провайдер ничего не изменил.
      throw error;
    }
  }

  private async prepare(
    params: SubscriptionAutoRenewalOperationParams,
  ): Promise<PreparedSubscriptionAutoRenewalChange> {
    return this.dataSource.runTransaction(
      async () => {
        const tx = this.dataSource.client;
        await this.subscriptions.lockByUserId(params.userId, tx);

        // Поиск среди подписок пользователя одновременно проверяет принадлежность.
        const subscriptions = await this.subscriptions.findByUserId(params.userId, tx);
        const subscription = subscriptions.find((item) => item.subscriptionId === params.subscriptionId);
        if (!subscription) throw new SubscriptionAutoRenewalConflictError('SUBSCRIPTION_NOT_FOUND');

        // Не начинаем изменение, пока другая ручная операция или перенос автопродления не завершены.
        if (
          subscriptions.some(
            (item) =>
              item.autoRenewalStatus === AutoRenewalStatus.ENABLING ||
              item.autoRenewalStatus === AutoRenewalStatus.DISABLING,
          )
        ) {
          throw new SubscriptionAutoRenewalConflictError('AUTO_RENEWAL_CHANGE_IN_PROGRESS');
        }

        // Старую связь, отключённую при переносе, больше нельзя включать или выключать вручную.
        if (subscription.autoRenewalStatus === AutoRenewalStatus.RETIRED) {
          throw new SubscriptionAutoRenewalConflictError('SUBSCRIPTION_RETIRED');
        }

        // D1 нужен ID provider-подписки, настройку которой требуется изменить.
        if (!subscription.providerSubscriptionId) {
          throw new SubscriptionAutoRenewalConflictError('PROVIDER_SUBSCRIPTION_MISSING');
        }

        // Пользователь управляет автопродлением только последней подписки в оплаченной очереди.
        if (subscriptions.some((item) => item.expiresAt > subscription.expiresAt)) {
          throw new SubscriptionAutoRenewalConflictError('SUBSCRIPTION_NOT_LAST');
        }

        // Включать можно до конца оплаченного срока; отключение разрешено и после его окончания.
        if (params.autoRenewalEnabled && subscription.expiresAt <= new Date()) {
          throw new SubscriptionAutoRenewalConflictError('SUBSCRIPTION_EXPIRED');
        }

        // Если настройка уже установлена, достаточно результата в checkpoint DBOS.
        const desiredStatus = params.autoRenewalEnabled
          ? AutoRenewalStatus.ENABLED
          : AutoRenewalStatus.DISABLED;
        const preparedChange = {
          ...params,
          provider: subscription.provider,
          providerSubscriptionId: subscription.providerSubscriptionId,
          completed: subscription.autoRenewalStatus === desiredStatus,
        };
        if (preparedChange.completed) return preparedChange;

        // Реальное изменение требует операции и переходного состояния подписки.
        const transitionStatus = params.autoRenewalEnabled
          ? AutoRenewalStatus.ENABLING
          : AutoRenewalStatus.DISABLING;
        const pendingStatus = params.autoRenewalEnabled
          ? AutoRenewalOperationStatus.ENABLE_PENDING
          : AutoRenewalOperationStatus.DISABLE_PENDING;

        // Операция хранит снимок provider-связи для повторов.
        const autoRenewalOperation: AutoRenewalOperation = {
          id: params.operationId,
          userId: params.userId,
          subscriptionId: subscription.subscriptionId,
          type: params.autoRenewalEnabled
            ? AutoRenewalOperationType.ENABLE
            : AutoRenewalOperationType.DISABLE,
          status: pendingStatus,
          provider: subscription.provider,
          providerSubscriptionId: subscription.providerSubscriptionId,
          paymentId: null,
          sourceSubscriptionId: null,
          sourceProviderSubscriptionId: null,
        };

        // Операция, состояние подписки и checkpoint DBOS сохраняются атомарно.
        // При восстановлении DBOS вернёт результат шага без повторного создания операции.
        await this.subscriptions.createAutoRenewalOperation(
          {
            operation: autoRenewalOperation,
            autoRenewalStatus: transitionStatus,
          },
          tx,
        );

        return preparedChange;
      },
      { name: 'prepareSubscriptionAutoRenewalChange' },
    );
  }

  private async confirm(
    params: SubscriptionAutoRenewalOperationParams,
  ): Promise<ChangeSubscriptionAutoRenewalResult> {
    return this.dataSource.runTransaction(
      async () => {
        const tx = this.dataSource.client;
        await this.subscriptions.lockByUserId(params.userId, tx);

        // prepare создал операцию с этим ID; внешний шаг успешно завершился.
        // DBOS сохраняет запись и результат вместе, поэтому завершённый шаг не применится повторно.
        await this.subscriptions.completeAutoRenewalOperation(
          {
            operationId: params.operationId,
            autoRenewalStatus: params.autoRenewalEnabled
              ? AutoRenewalStatus.ENABLED
              : AutoRenewalStatus.DISABLED,
          },
          tx,
        );

        // Возвращаем результат этой операции, а не текущую настройку подписки.
        return {
          operationId: params.operationId,
          subscriptionId: params.subscriptionId,
          autoRenewalEnabled: params.autoRenewalEnabled,
        };
      },
      { name: 'confirmSubscriptionAutoRenewalChange' },
    );
  }

  @DBOS.step(providerStepOptions)
  private async changeAtProvider(prepared: PreparedSubscriptionAutoRenewalChange): Promise<void> {
    // Все повторы передают D1 тот же ID операции и тот же снимок provider-связи.
    const command = {
      provider: prepared.provider,
      providerSubscriptionId: prepared.providerSubscriptionId,
      autoRenewalChangeId: prepared.operationId,
    };

    if (prepared.autoRenewalEnabled) await this.paymentsAutoRenewalGateway.enable(command);
    else await this.paymentsAutoRenewalGateway.disable(command);
  }
}
