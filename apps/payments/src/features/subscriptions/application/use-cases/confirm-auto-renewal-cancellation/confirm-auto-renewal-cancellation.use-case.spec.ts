import { describe, expect, it, vi } from 'vitest';
import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import type { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import { PaymentProvider } from '../../../../payments/domain/payment.entity.js';
import { AutoRenewalOperationType } from '../../../domain/enums/auto-renewal-operation-type.enum.js';
import type { AutoRenewalOperation, SubscriptionPaymentApplication } from '../../types/subscriptions.types.js';
import {
  ConfirmAutoRenewalCancellationCommand,
  ConfirmAutoRenewalCancellationUseCase,
} from './confirm-auto-renewal-cancellation.use-case.js';

describe('ConfirmAutoRenewalCancellationUseCase', () => {
  it('finds the transfer by payment ID and retires the old link in the supplied transaction', async () => {
    const { useCase, command, repository } = fixture();

    await useCase.execute(command);

    expect(repository.lockByUserId).toHaveBeenCalledExactlyOnceWith(42, command.tx);
    expect(repository.findPaymentApplication).toHaveBeenCalledTimes(2);
    expect(repository.findPaymentApplication).toHaveBeenNthCalledWith(2, command.paymentId, command.tx);
    expect(repository.confirmAutoRenewalCancellation).toHaveBeenCalledExactlyOnceWith(
      'payment-id',
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
    expect(repository.confirmAutoRenewalCancellation).not.toHaveBeenCalled();
    expect(repository.findByUserId).not.toHaveBeenCalled();
  });

  it('rereads the stage after waiting for the shared user lock', async () => {
    const { useCase, command, repository, operation, application } = fixture();
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
    expect(repository.findPaymentApplication).toHaveBeenCalledTimes(1);
    repository.findPaymentApplication.mockResolvedValue({
      ...application,
      autoRenewalOperation: { ...operation, status: AutoRenewalOperationStatus.BINDING_PENDING },
    });
    releaseLock();

    await pending;
    expect(repository.findPaymentApplication).toHaveBeenCalledTimes(2);
    expect(repository.confirmAutoRenewalCancellation).not.toHaveBeenCalled();
  });

  it.each([false, true])('rejects a missing payment application afterLock=%s', async (afterLock) => {
    const { useCase, command, repository, application } = fixture();
    repository.findPaymentApplication.mockResolvedValue(null);
    if (afterLock) repository.findPaymentApplication.mockResolvedValueOnce(application);

    await expect(useCase.execute(command)).rejects.toMatchObject({
      paymentId: command.paymentId,
      reason: afterLock ? 'CANCELLATION_APPLICATION_MISMATCH' : 'APPLICATION_NOT_FOUND',
    });
    if (!afterLock) expect(repository.lockByUserId).not.toHaveBeenCalled();
    expect(repository.confirmAutoRenewalCancellation).not.toHaveBeenCalled();
  });

  it.each([
    AutoRenewalOperationStatus.PENDING,
    AutoRenewalOperationStatus.BINDING_PENDING,
    AutoRenewalOperationStatus.COMPLETED,
  ])('rejects a different old provider ID even for a %s replay', async (status) => {
    const { useCase, command, repository, operation } = fixture();
    operation.status = status;
    operation.sourceProviderSubscriptionId = 'sub_other';

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'CANCELLATION_APPLICATION_MISMATCH' });
    expect(repository.confirmAutoRenewalCancellation).not.toHaveBeenCalled();
  });

  it.each(['CREATED', 'RENEWED'] as const)('rejects a %s application', async (action) => {
    const { useCase, command, repository, application } = fixture();
    application.result.action = action;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'CANCELLATION_APPLICATION_MISMATCH' });
    expect(repository.confirmAutoRenewalCancellation).not.toHaveBeenCalled();
  });

  it('requires a saved auto-renewal operation', async () => {
    const { useCase, command, repository, application } = fixture();
    application.autoRenewalOperation = null;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'CANCELLATION_APPLICATION_MISMATCH' });
    expect(repository.confirmAutoRenewalCancellation).not.toHaveBeenCalled();
  });

  it.each([AutoRenewalOperationType.ENABLE, AutoRenewalOperationType.DISABLE])(
    'rejects a manual %s operation',
    async (type) => {
      const { useCase, command, repository, operation } = fixture();
      operation.type = type;

      await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'CANCELLATION_APPLICATION_MISMATCH' });
      expect(repository.confirmAutoRenewalCancellation).not.toHaveBeenCalled();
    },
  );

  it('requires the saved old local link', async () => {
    const { useCase, command, repository, operation } = fixture();
    operation.sourceSubscriptionId = null;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'CANCELLATION_APPLICATION_MISMATCH' });
    expect(repository.confirmAutoRenewalCancellation).not.toHaveBeenCalled();
  });

  it('propagates write failure to the transaction owner', async () => {
    const { useCase, command, repository } = fixture();
    const error = new Error('write failed');
    repository.confirmAutoRenewalCancellation.mockRejectedValue(error);

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
  const application: SubscriptionPaymentApplication = {
    paymentId: 'payment-id',
    userId: 42,
    autoRenewalOperation: operation,
    result: {
      subscriptionId: 'new-subscription',
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: '2026-12-01T00:00:00.000Z',
      previousProviderSubscriptionId: 'sub_old',
    },
  };
  const repository = {
    findPaymentApplication: vi
      .fn<SubscriptionsRepository['findPaymentApplication']>()
      .mockResolvedValue(application),
    lockByUserId: vi.fn<SubscriptionsRepository['lockByUserId']>().mockResolvedValue(),
    confirmAutoRenewalCancellation: vi
      .fn<SubscriptionsRepository['confirmAutoRenewalCancellation']>()
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
    application,
    operation,
    command: new ConfirmAutoRenewalCancellationCommand('payment-id', 'sub_old', {}),
    useCase: new ConfirmAutoRenewalCancellationUseCase(repository),
  };
}
