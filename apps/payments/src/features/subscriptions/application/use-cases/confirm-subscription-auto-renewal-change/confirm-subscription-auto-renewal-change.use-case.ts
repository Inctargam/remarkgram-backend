import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { PaymentsTransactionContext } from '../../../../payments/application/ports/payments-unit-of-work.js';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionAutoRenewalConflictError } from '../../errors/subscription-auto-renewal.errors.js';
import { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import type {
  ChangeSubscriptionAutoRenewalResult,
  SubscriptionAutoRenewalOperationParams,
} from '../../types/subscription-auto-renewal.types.js';
import { readManualAutoRenewalOperation } from '../change-subscription-auto-renewal/auto-renewal-operation.policy.js';

export class ConfirmSubscriptionAutoRenewalChangeCommand extends Command<ChangeSubscriptionAutoRenewalResult> {
  constructor(
    public readonly params: SubscriptionAutoRenewalOperationParams,
    public readonly tx: PaymentsTransactionContext,
  ) {
    super();
  }
}

@CommandHandler(ConfirmSubscriptionAutoRenewalChangeCommand)
export class ConfirmSubscriptionAutoRenewalChangeUseCase implements ICommandHandler<ConfirmSubscriptionAutoRenewalChangeCommand> {
  constructor(private readonly subscriptions: SubscriptionsRepository) {}

  async execute({ params, tx }: ConfirmSubscriptionAutoRenewalChangeCommand) {
    await this.subscriptions.lockByUserId(params.userId, tx);
    const operation = await this.subscriptions.findAutoRenewalOperation(params.operationId, tx);
    if (!operation) throw new SubscriptionAutoRenewalConflictError('OPERATION_NOT_FOUND');
    const saved = readManualAutoRenewalOperation(operation, params);
    if (!saved.completed) {
      await this.subscriptions.completeAutoRenewalOperation(
        {
          operationId: operation.id,
          autoRenewalStatus: saved.autoRenewalEnabled
            ? AutoRenewalStatus.ENABLED
            : AutoRenewalStatus.DISABLED,
        },
        tx,
      );
    }
    return {
      operationId: operation.id,
      subscriptionId: operation.subscriptionId,
      autoRenewalEnabled: saved.autoRenewalEnabled,
    };
  }
}
