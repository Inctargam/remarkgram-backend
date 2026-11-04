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
      throw new SubscriptionCancellationConflictError(
        paymentId,
        providerSubscriptionId,
        'APPLICATION_NOT_FOUND',
      );
    }

    await this.subscriptionsRepository.lockByUserId(owner.userId, tx);

    const application = await this.subscriptionsRepository.findPaymentApplication(paymentId, tx);
    const autoRenewalOperation = application?.autoRenewalOperation;
    if (
      !application ||
      application.result.action !== 'SCHEDULED' ||
      !autoRenewalOperation ||
      autoRenewalOperation.type !== AutoRenewalOperationType.TRANSFER ||
      !autoRenewalOperation.sourceSubscriptionId ||
      autoRenewalOperation.sourceProviderSubscriptionId !== providerSubscriptionId
    ) {
      throw new SubscriptionCancellationConflictError(
        paymentId,
        providerSubscriptionId,
        'CANCELLATION_APPLICATION_MISMATCH',
      );
    }

    switch (autoRenewalOperation.status) {
      // Провайдер подтвердил отключение: старая подписка станет RETIRED, операция — BINDING_PENDING.
      case AutoRenewalOperationStatus.DISABLE_PENDING:
        return this.subscriptionsRepository.confirmAutoRenewalCancellation(autoRenewalOperation.id, tx);
      // Отключение уже подтверждено: новая связь ожидает привязки или уже привязана.
      // Повтор завершается без записи, даже если настройки подписки после этого изменились.
      case AutoRenewalOperationStatus.BINDING_PENDING:
      case AutoRenewalOperationStatus.COMPLETED:
        return;
      default:
        // Из текущего enum сюда попадает только ENABLE_PENDING — ожидание ручного включения.
        // Для TRANSFER этот статус недопустим и означает несогласованное состояние операции.
        throw new SubscriptionCancellationConflictError(
          paymentId,
          providerSubscriptionId,
          'CANCELLATION_APPLICATION_MISMATCH',
        );
    }
  }
}
