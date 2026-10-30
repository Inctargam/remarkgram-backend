import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { PaymentsTransactionContext } from '../../../../payments/application/ports/payments-unit-of-work.js';
import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalOperationType } from '../../../domain/enums/auto-renewal-operation-type.enum.js';
import { SubscriptionCancellationConflictError } from '../../errors/subscription-cancellation-conflict.error.js';
import { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';

export class ConfirmAutoRenewalCancellationCommand extends Command<void> {
  constructor(
    public readonly paymentId: string,
    public readonly providerSubscriptionId: string,
    public readonly tx: PaymentsTransactionContext,
  ) {
    super();
  }
}

@CommandHandler(ConfirmAutoRenewalCancellationCommand)
export class ConfirmAutoRenewalCancellationUseCase implements ICommandHandler<ConfirmAutoRenewalCancellationCommand> {
  constructor(private readonly subscriptionsRepository: SubscriptionsRepository) {}

  async execute(command: ConfirmAutoRenewalCancellationCommand) {
    const { paymentId, providerSubscriptionId, tx } = command;
    const owner = await this.subscriptionsRepository.findPaymentApplication(paymentId, tx);
    if (!owner) {
      throw new SubscriptionCancellationConflictError(paymentId, providerSubscriptionId, 'APPLICATION_NOT_FOUND');
    }

    await this.subscriptionsRepository.lockByUserId(owner.userId, tx);
    const application = await this.subscriptionsRepository.findPaymentApplication(paymentId, tx);
    const operation = application?.autoRenewalOperation;
    if (
      !application ||
      application.result.action !== 'SCHEDULED' ||
      !operation ||
      operation.type !== AutoRenewalOperationType.TRANSFER ||
      !operation.sourceSubscriptionId ||
      operation.sourceProviderSubscriptionId !== providerSubscriptionId
    ) {
      throw new SubscriptionCancellationConflictError(
        paymentId,
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

    await this.subscriptionsRepository.confirmAutoRenewalCancellation(
      operation.id,
      tx,
    );
  }
}
