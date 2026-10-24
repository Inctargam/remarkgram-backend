import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { PaymentsTransactionContext } from '../../../../payments/application/ports/payments-unit-of-work.js';
import { SubscriptionPaymentProcessingStatus } from '../../../domain/enums/subscription-payment-processing-status.enum.js';
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
    const candidates = await this.subscriptionsRepository.findCancellationApplications(
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
    const applications = await this.subscriptionsRepository.findCancellationApplications(
      subscriptionId,
      providerSubscriptionId,
      tx,
    );
    const application = applications[0];
    if (!application || applications.length !== 1) {
      throw new SubscriptionCancellationConflictError(
        subscriptionId,
        providerSubscriptionId,
        application ? 'AMBIGUOUS_APPLICATION' : 'APPLICATION_NOT_FOUND',
      );
    }
    if (!application.previousSubscriptionId) {
      throw new SubscriptionCancellationConflictError(
        subscriptionId,
        providerSubscriptionId,
        'CANCELLATION_APPLICATION_MISMATCH',
      );
    }

    // Этап операции сохраняется независимо от последующих изменений новой подписки.
    if (
      application.processingStatus === SubscriptionPaymentProcessingStatus.BINDING_PENDING ||
      application.processingStatus === SubscriptionPaymentProcessingStatus.COMPLETED
    ) {
      return;
    }

    await this.subscriptionsRepository.completeProviderSubscriptionCancellation(
      {
        paymentId: application.paymentId,
        autoRenewalStatus: AutoRenewalStatus.RETIRED,
        processingStatus: SubscriptionPaymentProcessingStatus.BINDING_PENDING,
      },
      tx,
    );
  }
}
