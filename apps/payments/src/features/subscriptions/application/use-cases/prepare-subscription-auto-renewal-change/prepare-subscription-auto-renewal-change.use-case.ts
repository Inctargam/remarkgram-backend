import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { PaymentsTransactionContext } from '../../../../payments/application/ports/payments-unit-of-work.js';
import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalOperationType } from '../../../domain/enums/auto-renewal-operation-type.enum.js';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionAutoRenewalConflictError } from '../../errors/subscription-auto-renewal.errors.js';
import { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import type { AutoRenewalOperation } from '../../types/subscriptions.types.js';
import type {
  PreparedSubscriptionAutoRenewalChange,
  SubscriptionAutoRenewalOperationParams,
} from '../../types/subscription-auto-renewal.types.js';
import { readManualAutoRenewalOperation } from '../change-subscription-auto-renewal/auto-renewal-operation.policy.js';

export class PrepareSubscriptionAutoRenewalChangeCommand extends Command<PreparedSubscriptionAutoRenewalChange> {
  constructor(
    public readonly params: SubscriptionAutoRenewalOperationParams,
    public readonly tx: PaymentsTransactionContext,
  ) {
    super();
  }
}

@CommandHandler(PrepareSubscriptionAutoRenewalChangeCommand)
export class PrepareSubscriptionAutoRenewalChangeUseCase implements ICommandHandler<PrepareSubscriptionAutoRenewalChangeCommand> {
  constructor(private readonly subscriptions: SubscriptionsRepository) {}

  async execute({ params, tx }: PrepareSubscriptionAutoRenewalChangeCommand) {
    await this.subscriptions.lockByUserId(params.userId, tx);
    const saved = await this.subscriptions.findAutoRenewalOperation(params.operationId, tx);
    if (saved) return readManualAutoRenewalOperation(saved, params);

    const subscriptions = await this.subscriptions.findByUserId(params.userId, tx);
    const subscription = subscriptions.find((item) => item.subscriptionId === params.subscriptionId);
    if (!subscription) throw new SubscriptionAutoRenewalConflictError('SUBSCRIPTION_NOT_FOUND');
    if (
      subscriptions.some(
        (item) =>
          item.autoRenewalStatus === AutoRenewalStatus.ENABLING ||
          item.autoRenewalStatus === AutoRenewalStatus.DISABLING,
      )
    ) {
      throw new SubscriptionAutoRenewalConflictError('AUTO_RENEWAL_CHANGE_IN_PROGRESS');
    }
    if (subscription.autoRenewalStatus === AutoRenewalStatus.RETIRED) {
      throw new SubscriptionAutoRenewalConflictError('SUBSCRIPTION_RETIRED');
    }
    if (!subscription.providerSubscriptionId) {
      throw new SubscriptionAutoRenewalConflictError('PROVIDER_SUBSCRIPTION_MISSING');
    }
    if (subscriptions.some((item) => item.expiresAt > subscription.expiresAt)) {
      throw new SubscriptionAutoRenewalConflictError('SUBSCRIPTION_NOT_LAST');
    }
    if (params.autoRenewalEnabled && subscription.expiresAt <= new Date()) {
      throw new SubscriptionAutoRenewalConflictError('SUBSCRIPTION_EXPIRED');
    }

    const desiredStatus = params.autoRenewalEnabled ? AutoRenewalStatus.ENABLED : AutoRenewalStatus.DISABLED;
    const completed = subscription.autoRenewalStatus === desiredStatus;
    const operation: AutoRenewalOperation = {
      id: params.operationId,
      userId: params.userId,
      subscriptionId: subscription.subscriptionId,
      type: params.autoRenewalEnabled ? AutoRenewalOperationType.ENABLE : AutoRenewalOperationType.DISABLE,
      status: completed ? AutoRenewalOperationStatus.COMPLETED : AutoRenewalOperationStatus.PENDING,
      provider: subscription.provider,
      providerSubscriptionId: subscription.providerSubscriptionId,
      paymentId: null,
      sourceSubscriptionId: null,
      sourceProviderSubscriptionId: null,
    };
    await this.subscriptions.createAutoRenewalOperation(
      {
        operation,
        autoRenewalStatus: completed
          ? null
          : params.autoRenewalEnabled
            ? AutoRenewalStatus.ENABLING
            : AutoRenewalStatus.DISABLING,
      },
      tx,
    );
    return readManualAutoRenewalOperation(operation, params);
  }
}
