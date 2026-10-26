import { describe, expect, it, vi } from 'vitest';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import type { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import { PaymentProvider } from '../../../../payments/domain/payment.entity.js';
import { AutoRenewalOperationType } from '../../../domain/enums/auto-renewal-operation-type.enum.js';
import type { AutoRenewalOperation } from '../../types/subscriptions.types.js';
import {
  MarkProviderSubscriptionCancellationScheduledCommand,
  MarkProviderSubscriptionCancellationScheduledUseCase,
} from './mark-provider-subscription-cancellation-scheduled.use-case.js';

describe('MarkProviderSubscriptionCancellationScheduledUseCase', () => {
  it('resolves the payment from the original D1 subscription/provider arguments', async () => {
    const { useCase, command, repository } = fixture();

    await useCase.execute(command);

    expect(repository.lockByUserId).toHaveBeenCalledExactlyOnceWith(42, command.tx);
    expect(repository.findCancellationOperations).toHaveBeenCalledTimes(2);
    expect(repository.findCancellationOperations).toHaveBeenNthCalledWith(
      2,
      command.subscriptionId,
      command.providerSubscriptionId,
      command.tx,
    );
    expect(repository.completeProviderSubscriptionCancellation).toHaveBeenCalledExactlyOnceWith(
      {
        operationId: 'payment-id',
        autoRenewalStatus: AutoRenewalStatus.RETIRED,
        status: AutoRenewalOperationStatus.BINDING_PENDING,
      },
      command.tx,
    );
  });

  it.each([
    AutoRenewalOperationStatus.BINDING_PENDING,
    AutoRenewalOperationStatus.COMPLETED,
  ])('replays %s without loading or changing subscription states', async (status) => {
    const { useCase, command, repository, operation } = fixture();
    operation.status = status;
    if (status === AutoRenewalOperationStatus.COMPLETED) operation.providerSubscriptionId = 'sub_new';

    await expect(useCase.execute(command)).resolves.toBeUndefined();
    expect(repository.completeProviderSubscriptionCancellation).not.toHaveBeenCalled();
    expect(repository.findByUserId).not.toHaveBeenCalled();
  });

  it('rereads the stage after waiting for the shared user lock', async () => {
    const { useCase, command, repository, operation } = fixture();
    let releaseLock!: () => void;
    const lockEntered = new Promise<void>((resolve) => {
      repository.lockByUserId.mockImplementation(() => {
        resolve();
        return new Promise<void>((release) => {
          releaseLock = release;
        });
      });
    });
    const pending = useCase.execute(command);
    await lockEntered;
    expect(repository.findCancellationOperations).toHaveBeenCalledTimes(1);
    repository.findCancellationOperations.mockResolvedValue([
      { ...operation, status: AutoRenewalOperationStatus.BINDING_PENDING },
    ]);
    releaseLock();

    await pending;
    expect(repository.findCancellationOperations).toHaveBeenCalledTimes(2);
    expect(repository.completeProviderSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it.each([false, true])('rejects a missing or mismatched provider link afterLock=%s', async (afterLock) => {
    const { useCase, command, repository, operation } = fixture();
    repository.findCancellationOperations.mockResolvedValue([]);
    if (afterLock) repository.findCancellationOperations.mockResolvedValueOnce([operation]);

    await expect(useCase.execute(command)).rejects.toMatchObject({
      subscriptionId: command.subscriptionId,
      reason: 'APPLICATION_NOT_FOUND',
    });
    expect(repository.completeProviderSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it.each([false, true])('rejects an ambiguous operation afterLock=%s', async (afterLock) => {
    const { useCase, command, repository, operation } = fixture();
    repository.findCancellationOperations.mockResolvedValue([
      operation,
      { ...operation, paymentId: 'other-payment' },
    ]);
    if (afterLock) repository.findCancellationOperations.mockResolvedValueOnce([operation]);

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'AMBIGUOUS_APPLICATION' });
    expect(repository.completeProviderSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it('requires the saved old local link', async () => {
    const { useCase, command, repository, operation } = fixture();
    operation.sourceSubscriptionId = null;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'CANCELLATION_APPLICATION_MISMATCH' });
    expect(repository.completeProviderSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it('propagates write failure to the transaction owner', async () => {
    const { useCase, command, repository } = fixture();
    const error = new Error('write failed');
    repository.completeProviderSubscriptionCancellation.mockRejectedValue(error);

    await expect(useCase.execute(command)).rejects.toBe(error);
  });
});

function fixture() {
  const operation: AutoRenewalOperation = {
    id: 'payment-id',
    paymentId: 'payment-id',
    userId: 42,
    type: AutoRenewalOperationType.TRANSFER,
    status: AutoRenewalOperationStatus.PENDING,
    subscriptionId: 'new-subscription',
    provider: PaymentProvider.STRIPE,
    providerSubscriptionId: null,
    sourceSubscriptionId: 'old-subscription',
    sourceProviderSubscriptionId: 'sub_old',
  };
  const repository = {
    findCancellationOperations: vi
      .fn<SubscriptionsRepository['findCancellationOperations']>()
      .mockResolvedValue([operation]),
    lockByUserId: vi.fn<SubscriptionsRepository['lockByUserId']>().mockResolvedValue(),
    findPaymentApplication: vi.fn<SubscriptionsRepository['findPaymentApplication']>(),
    completeProviderSubscriptionCancellation: vi
      .fn<SubscriptionsRepository['completeProviderSubscriptionCancellation']>()
      .mockResolvedValue(),
    bindProviderSubscription: vi.fn<SubscriptionsRepository['bindProviderSubscription']>(),
    findByUserId: vi.fn<SubscriptionsRepository['findByUserId']>(),
    markExpired: vi.fn<SubscriptionsRepository['markExpired']>(),
    setAutoRenewalState: vi.fn<SubscriptionsRepository['setAutoRenewalState']>(),
    renewWithPaymentApplication: vi.fn<SubscriptionsRepository['renewWithPaymentApplication']>(),
    createWithPaymentApplication: vi.fn<SubscriptionsRepository['createWithPaymentApplication']>(),
  };
  return {
    repository,
    operation,
    command: new MarkProviderSubscriptionCancellationScheduledCommand('new-subscription', 'sub_old', {}),
    useCase: new MarkProviderSubscriptionCancellationScheduledUseCase(repository),
  };
}
