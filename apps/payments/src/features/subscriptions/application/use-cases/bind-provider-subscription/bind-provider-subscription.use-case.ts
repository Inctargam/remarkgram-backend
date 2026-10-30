import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { PaymentsTransactionContext } from '../../../../payments/application/ports/payments-unit-of-work.js';
import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalOperationType } from '../../../domain/enums/auto-renewal-operation-type.enum.js';
import { SubscriptionBindingConflictError } from '../../errors/subscription-binding-conflict.error.js';
import { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';

export class BindProviderSubscriptionCommand extends Command<void> {
  constructor(
    public readonly paymentId: string,
    public readonly providerSubscriptionId: string,
    public readonly tx: PaymentsTransactionContext,
  ) {
    super();
  }
}

@CommandHandler(BindProviderSubscriptionCommand)
export class BindProviderSubscriptionUseCase implements ICommandHandler<BindProviderSubscriptionCommand> {
  constructor(private readonly subscriptionsRepository: SubscriptionsRepository) {}

  async execute(command: BindProviderSubscriptionCommand) {
    const { paymentId, providerSubscriptionId, tx } = command;
    const owner = await this.subscriptionsRepository.findPaymentApplication(paymentId, tx);
    if (!owner) {
      throw new SubscriptionBindingConflictError(paymentId, providerSubscriptionId, 'APPLICATION_NOT_FOUND');
    }

    await this.subscriptionsRepository.lockByUserId(owner.userId, tx);
    const application = await this.subscriptionsRepository.findPaymentApplication(paymentId, tx);
    const operation = application?.autoRenewalOperation;
    if (
      !application ||
      application.result.action !== 'SCHEDULED' ||
      !operation ||
      operation.type !== AutoRenewalOperationType.TRANSFER
    ) {
      throw new SubscriptionBindingConflictError(
        paymentId,
        providerSubscriptionId,
        'BINDING_APPLICATION_MISMATCH',
      );
    }

    // Снимок операции распознаёт поздний повтор, не включая автопродление заново.
    if (operation.status === AutoRenewalOperationStatus.COMPLETED) {
      if (operation.providerSubscriptionId === providerSubscriptionId) return;
      throw new SubscriptionBindingConflictError(
        paymentId,
        providerSubscriptionId,
        'PROVIDER_SUBSCRIPTION_MISMATCH',
      );
    }
    if (operation.status !== AutoRenewalOperationStatus.BINDING_PENDING) {
      throw new SubscriptionBindingConflictError(paymentId, providerSubscriptionId, 'CANCELLATION_NOT_CONFIRMED');
    }

    await this.subscriptionsRepository.bindProviderSubscription(
      {
        operationId: operation.id,
        providerSubscriptionId,
      },
      tx,
    );
  }
}
