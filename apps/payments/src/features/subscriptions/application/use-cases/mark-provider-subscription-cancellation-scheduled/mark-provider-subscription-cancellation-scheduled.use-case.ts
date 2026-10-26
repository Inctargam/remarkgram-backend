import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { PaymentsTransactionContext } from '../../../../payments/application/ports/payments-unit-of-work.js';
import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionCancellationConflictError } from '../../errors/subscription-cancellation-conflict.error.js';
import { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';

export class MarkProviderSubscriptionCancellationScheduledCommand extends Command<void> {
  constructor(
    public readonly subscriptionId: string,
    public readonly providerSubscriptionId: string,
    public readonly tx: PaymentsTransactionContext,
  ) {
    super();
  }
}

@CommandHandler(MarkProviderSubscriptionCancellationScheduledCommand)
export class MarkProviderSubscriptionCancellationScheduledUseCase implements ICommandHandler<MarkProviderSubscriptionCancellationScheduledCommand> {
  constructor(private readonly subscriptionsRepository: SubscriptionsRepository) {}

  async execute(command: MarkProviderSubscriptionCancellationScheduledCommand) {
    const { subscriptionId, providerSubscriptionId, tx } = command;
    const candidates = await this.subscriptionsRepository.findCancellationOperations(
      subscriptionId,
      providerSubscriptionId,
      tx,
    );
    const owner = candidates[0];
    if (!owner || candidates.length !== 1) {
      throw new SubscriptionCancellationConflictError(
        subscriptionId,
        providerSubscriptionId,
        owner ? 'AMBIGUOUS_APPLICATION' : 'APPLICATION_NOT_FOUND',
      );
    }

    await this.subscriptionsRepository.lockByUserId(owner.userId, tx);
    const operations = await this.subscriptionsRepository.findCancellationOperations(
      subscriptionId,
      providerSubscriptionId,
      tx,
    );
    const operation = operations[0];
    if (!operation || operations.length !== 1) {
      throw new SubscriptionCancellationConflictError(
        subscriptionId,
        providerSubscriptionId,
        operation ? 'AMBIGUOUS_APPLICATION' : 'APPLICATION_NOT_FOUND',
      );
    }
    if (!operation.sourceSubscriptionId) {
      throw new SubscriptionCancellationConflictError(
        subscriptionId,
        providerSubscriptionId,
        'CANCELLATION_APPLICATION_MISMATCH',
      );
    }

    // Этап операции сохраняется независимо от последующих изменений новой подписки.
    if (
      operation.status === AutoRenewalOperationStatus.BINDING_PENDING ||
      operation.status === AutoRenewalOperationStatus.COMPLETED
    ) {
      return;
    }

    await this.subscriptionsRepository.completeProviderSubscriptionCancellation(
      {
        operationId: operation.id,
        autoRenewalStatus: AutoRenewalStatus.RETIRED,
        status: AutoRenewalOperationStatus.BINDING_PENDING,
      },
      tx,
    );
  }
}
