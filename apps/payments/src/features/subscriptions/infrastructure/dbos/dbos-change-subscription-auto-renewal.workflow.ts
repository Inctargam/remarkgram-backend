import { ConfiguredInstance, DBOS, type StepConfig } from '@dbos-inc/dbos-sdk';
import { Injectable, Logger } from '@nestjs/common';
import { PaymentsDbosDataSource } from '../../../payments/infrastructure/dbos/payments-dbos.datasource.js';
import { PaymentsErrorCode } from '../../../../common/domain/errors/payments.error.js';
import { ChangeSubscriptionAutoRenewalWorkflow } from '../../application/ports/change-subscription-auto-renewal.workflow.js';
import { ProviderSubscriptionAutoRenewalGateway } from '../../application/ports/provider-subscription-auto-renewal.gateway.js';
import { SubscriptionAutoRenewalIdempotencyConflictError } from '../../application/errors/subscription-auto-renewal.errors.js';
import type {
  ChangeSubscriptionAutoRenewalResult,
  ChangeSubscriptionAutoRenewalWorkflowParams,
  PreparedSubscriptionAutoRenewalChange,
  SubscriptionAutoRenewalIntent,
} from '../../application/types/subscription-auto-renewal.types.js';
import {
  PrepareSubscriptionAutoRenewalChangeCommand,
  PrepareSubscriptionAutoRenewalChangeUseCase,
} from '../../application/use-cases/prepare-subscription-auto-renewal-change/prepare-subscription-auto-renewal-change.use-case.js';
import {
  ConfirmSubscriptionAutoRenewalChangeCommand,
  ConfirmSubscriptionAutoRenewalChangeUseCase,
} from '../../application/use-cases/confirm-subscription-auto-renewal-change/confirm-subscription-auto-renewal-change.use-case.js';
import {
  getAutoRenewalWorkflowErrorCode,
  restoreAutoRenewalWorkflowError,
} from './auto-renewal-workflow-error.mapper.js';

const providerStepOptions = {
  name: 'changeSubscriptionAutoRenewalAtProviderV1',
  retriesAllowed: true,
  maxAttempts: 10,
  intervalSeconds: 10,
  backoffRate: 2,
  shouldRetry: (error: unknown) => {
    const code = getAutoRenewalWorkflowErrorCode(error);
    return (
      code === PaymentsErrorCode.PAYMENT_PROVIDER_UNAVAILABLE ||
      code === PaymentsErrorCode.PAYMENT_PROVIDER_OUTCOME_UNKNOWN
    );
  },
} satisfies StepConfig;

@Injectable()
export class DbosChangeSubscriptionAutoRenewalWorkflow
  extends ConfiguredInstance
  implements ChangeSubscriptionAutoRenewalWorkflow
{
  private readonly logger = new Logger(DbosChangeSubscriptionAutoRenewalWorkflow.name);

  constructor(
    private readonly dataSource: PaymentsDbosDataSource,
    private readonly gateway: ProviderSubscriptionAutoRenewalGateway,
    private readonly prepare: PrepareSubscriptionAutoRenewalChangeUseCase,
    private readonly confirm: ConfirmSubscriptionAutoRenewalChangeUseCase,
  ) {
    super('change-subscription-auto-renewal-workflow');
  }

  async execute(
    params: ChangeSubscriptionAutoRenewalWorkflowParams,
  ): Promise<ChangeSubscriptionAutoRenewalResult> {
    const { workflowId, ...input } = params;
    try {
      const handle = await DBOS.startWorkflow(this, { workflowID: workflowId }).changeAutoRenewal(input);
      const status = await handle.getStatus();
      if (status?.input === undefined) throw new Error('Auto-renewal workflow has no saved input');
      const [saved] = status.input as [SubscriptionAutoRenewalIntent];
      if (
        saved.userId !== input.userId ||
        saved.subscriptionId !== input.subscriptionId ||
        saved.autoRenewalEnabled !== input.autoRenewalEnabled
      ) {
        throw new SubscriptionAutoRenewalIdempotencyConflictError();
      }
      return await handle.getResult();
    } catch (error) {
      throw restoreAutoRenewalWorkflowError(error);
    }
  }

  // Durable call order belongs to V1. Recovery reuses both the UUID and the successful provider step.
  @DBOS.workflow({ name: 'changeSubscriptionAutoRenewalV1', maxRecoveryAttempts: 100 })
  async changeAutoRenewal(
    input: SubscriptionAutoRenewalIntent,
  ): Promise<ChangeSubscriptionAutoRenewalResult> {
    const operationId = await DBOS.randomUUID();
    const params = { ...input, operationId };
    try {
      const prepared = await this.dataSource.runTransaction(
        () =>
          this.prepare.execute(
            new PrepareSubscriptionAutoRenewalChangeCommand(params, this.dataSource.client),
          ),
        { name: 'prepareSubscriptionAutoRenewalChange' },
      );
      if (prepared.completed) {
        return {
          operationId,
          subscriptionId: prepared.subscriptionId,
          autoRenewalEnabled: prepared.autoRenewalEnabled,
        };
      }
      await this.changeAtProvider(prepared);
      return await this.dataSource.runTransaction(
        () =>
          this.confirm.execute(
            new ConfirmSubscriptionAutoRenewalChangeCommand(params, this.dataSource.client),
          ),
        { name: 'confirmSubscriptionAutoRenewalChange' },
      );
    } catch (error) {
      this.logger.error({
        event: 'subscription_auto_renewal_failed',
        workflowId: DBOS.workflowID,
        operationId,
        code: getAutoRenewalWorkflowErrorCode(error),
      });
      // Preserve the transition: a failed response does not prove that the provider changed nothing.
      throw error;
    }
  }

  @DBOS.step(providerStepOptions)
  private async changeAtProvider(prepared: PreparedSubscriptionAutoRenewalChange): Promise<void> {
    const command = {
      provider: prepared.provider,
      providerSubscriptionId: prepared.providerSubscriptionId,
      autoRenewalChangeId: prepared.operationId,
    };
    if (prepared.autoRenewalEnabled) await this.gateway.enable(command);
    else await this.gateway.disable(command);
  }
}
