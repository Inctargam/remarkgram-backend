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

    const autoRenewalOperation = application?.autoRenewalOperation;
    if (
      !application ||
      application.result.action !== 'SCHEDULED' ||
      !autoRenewalOperation ||
      autoRenewalOperation.type !== AutoRenewalOperationType.TRANSFER
    ) {
      throw new SubscriptionBindingConflictError(
        paymentId,
        providerSubscriptionId,
        'BINDING_APPLICATION_MISMATCH',
      );
    }

    switch (autoRenewalOperation.status) {
      // Старое автопродление отключено: сохраняем новую provider-связь и завершаем операцию.
      case AutoRenewalOperationStatus.BINDING_PENDING:
        return this.subscriptionsRepository.bindProviderSubscription(
          {
            paymentId,
            operationId: autoRenewalOperation.id,
            providerSubscriptionId,
          },
          tx,
        );
      case AutoRenewalOperationStatus.COMPLETED:
        // Снимок распознаёт поздний повтор, не включая автопродление заново.
        if (autoRenewalOperation.providerSubscriptionId === providerSubscriptionId) return;
        // Операция уже завершена с другим provider ID — это не повтор.
        throw new SubscriptionBindingConflictError(
          paymentId,
          providerSubscriptionId,
          'PROVIDER_SUBSCRIPTION_MISMATCH',
        );
      default:
        // DISABLE_PENDING: отключение ещё не подтверждено. ENABLE_PENDING недопустим для TRANSFER.
        throw new SubscriptionBindingConflictError(
          paymentId,
          providerSubscriptionId,
          'CANCELLATION_NOT_CONFIRMED',
        );
    }
  }
}
