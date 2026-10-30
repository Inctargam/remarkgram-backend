import { describe, expect, it, vi } from 'vitest';
import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import type { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import { PaymentProvider } from '../../../../payments/domain/payment.entity.js';
import { AutoRenewalOperationType } from '../../../domain/enums/auto-renewal-operation-type.enum.js';
import type { AutoRenewalOperation, SubscriptionPaymentApplication } from '../../types/subscriptions.types.js';
import {
  BindProviderSubscriptionCommand,
  BindProviderSubscriptionUseCase,
} from './bind-provider-subscription.use-case.js';

describe('BindProviderSubscriptionUseCase', () => {
  it('binds the new provider link and completes the operation in the supplied transaction', async () => {
    const { useCase, command, repository } = fixture();

    await useCase.execute(command);

    expect(repository.lockByUserId).toHaveBeenCalledExactlyOnceWith(42, command.tx);
    expect(repository.findPaymentApplication).toHaveBeenCalledTimes(2);
    expect(repository.findPaymentApplication).toHaveBeenNthCalledWith(2, command.paymentId, command.tx);
    expect(repository.bindProviderSubscription).toHaveBeenCalledExactlyOnceWith(
      {
        operationId: command.paymentId,
        providerSubscriptionId: command.providerSubscriptionId,
      },
      command.tx,
    );
    expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
    expect(repository.confirmAutoRenewalCancellation).not.toHaveBeenCalled();
  });

  it('replays from the completed snapshot after later auto-renewal changes without reading subscriptions', async () => {
    const { useCase, command, repository, operation } = fixture();
    operation.status = AutoRenewalOperationStatus.COMPLETED;
    operation.providerSubscriptionId = command.providerSubscriptionId;

    await expect(useCase.execute(command)).resolves.toBeUndefined();
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
    expect(repository.findByUserId).not.toHaveBeenCalled();
    expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
  });

  it.each(['sub_other', null])('rejects a completed operation with snapshot %s', async (providerId) => {
    const { useCase, command, repository, operation } = fixture();
    operation.status = AutoRenewalOperationStatus.COMPLETED;
    operation.providerSubscriptionId = providerId;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'PROVIDER_SUBSCRIPTION_MISMATCH' });
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it('rejects binding before cancellation is confirmed', async () => {
    const { useCase, command, repository, operation } = fixture();
    operation.status = AutoRenewalOperationStatus.PENDING;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'CANCELLATION_NOT_CONFIRMED' });
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it('rejects an unknown payment before locking', async () => {
    const { useCase, command, repository } = fixture();
    repository.findPaymentApplication.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toMatchObject({
      name: 'SubscriptionBindingConflictError',
      paymentId: command.paymentId,
      reason: 'APPLICATION_NOT_FOUND',
    });
    expect(repository.lockByUserId).not.toHaveBeenCalled();
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it('rejects an absent application after locking', async () => {
    const { useCase, command, repository, application } = fixture();
    repository.findPaymentApplication.mockResolvedValueOnce(application).mockResolvedValueOnce(null);

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'BINDING_APPLICATION_MISMATCH' });
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it.each(['CREATED', 'RENEWED'] as const)('rejects %s even with the same completed provider ID', async (action) => {
    const { useCase, command, repository, application, operation } = fixture();
    application.result.action = action;
    operation.status = AutoRenewalOperationStatus.COMPLETED;
    operation.providerSubscriptionId = command.providerSubscriptionId;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'BINDING_APPLICATION_MISMATCH' });
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it('rereads completion after waiting for the shared user lock', async () => {
    const { useCase, command, repository, application, operation } = fixture();
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
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
    repository.findPaymentApplication.mockResolvedValue({
      ...application,
      autoRenewalOperation: {
        ...operation,
        status: AutoRenewalOperationStatus.COMPLETED,
        providerSubscriptionId: command.providerSubscriptionId,
      },
    });
    releaseLock();

    await pending;
    expect(repository.findPaymentApplication).toHaveBeenCalledTimes(2);
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it('rejects an application without an auto-renewal operation', async () => {
    const { useCase, command, repository, application } = fixture();
    application.autoRenewalOperation = null;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'BINDING_APPLICATION_MISMATCH' });
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it.each([AutoRenewalOperationType.ENABLE, AutoRenewalOperationType.DISABLE])(
    'does not bind a manual %s operation through the payment contract',
    async (type) => {
      const { useCase, command, repository, operation } = fixture();
      operation.type = type;

      await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'BINDING_APPLICATION_MISMATCH' });
      expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
    },
  );

  it('propagates write failure to the transaction owner', async () => {
    const { useCase, command, repository } = fixture();
    const error = new Error('write failed');
    repository.bindProviderSubscription.mockRejectedValue(error);

    await expect(useCase.execute(command)).rejects.toBe(error);
  });
});

function fixture() {
  const operation: AutoRenewalOperation = {
    id: 'payment-id',
    paymentId: 'payment-id',
    userId: 42,
    type: AutoRenewalOperationType.TRANSFER,
    status: AutoRenewalOperationStatus.BINDING_PENDING,
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
    lockByUserId: vi.fn<SubscriptionsRepository['lockByUserId']>().mockResolvedValue(),
    findPaymentApplication: vi
      .fn<SubscriptionsRepository['findPaymentApplication']>()
      .mockResolvedValue(application),
    confirmAutoRenewalCancellation: vi
      .fn<SubscriptionsRepository['confirmAutoRenewalCancellation']>()
      .mockResolvedValue(),
    bindProviderSubscription: vi.fn<SubscriptionsRepository['bindProviderSubscription']>().mockResolvedValue(),
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
    command: new BindProviderSubscriptionCommand('payment-id', 'sub_new', {}),
    useCase: new BindProviderSubscriptionUseCase(repository),
  };
}
