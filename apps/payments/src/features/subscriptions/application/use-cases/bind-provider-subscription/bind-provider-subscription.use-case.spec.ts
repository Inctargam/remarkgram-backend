import { describe, expect, it, vi } from 'vitest';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionPaymentProcessingStatus } from '../../../domain/enums/subscription-payment-processing-status.enum.js';
import type { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import type { SubscriptionPaymentApplication } from '../../types/subscriptions.types.js';
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
        paymentId: command.paymentId,
        providerSubscriptionId: command.providerSubscriptionId,
        autoRenewalStatus: AutoRenewalStatus.ENABLED,
        processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
      },
      command.tx,
    );
    expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
    expect(repository.completeProviderSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it('replays from the completed snapshot after later auto-renewal changes without reading subscriptions', async () => {
    const { useCase, command, repository, application } = fixture();
    application.processingStatus = SubscriptionPaymentProcessingStatus.COMPLETED;
    application.boundProviderSubscriptionId = command.providerSubscriptionId;

    await expect(useCase.execute(command)).resolves.toBeUndefined();
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
    expect(repository.findByUserId).not.toHaveBeenCalled();
    expect(repository.setAutoRenewalState).not.toHaveBeenCalled();
  });

  it.each(['sub_other', null])('rejects a completed operation with snapshot %s', async (providerId) => {
    const { useCase, command, repository, application } = fixture();
    application.processingStatus = SubscriptionPaymentProcessingStatus.COMPLETED;
    application.boundProviderSubscriptionId = providerId;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'PROVIDER_SUBSCRIPTION_MISMATCH' });
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it('rejects binding before cancellation is confirmed', async () => {
    const { useCase, command, repository, application } = fixture();
    application.processingStatus = SubscriptionPaymentProcessingStatus.CANCELLATION_PENDING;

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
    const { useCase, command, repository, application } = fixture();
    application.result.action = action;
    application.processingStatus = SubscriptionPaymentProcessingStatus.COMPLETED;
    application.boundProviderSubscriptionId = command.providerSubscriptionId;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'BINDING_APPLICATION_MISMATCH' });
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it('checks the local subscription ID required by the current D1 contract', async () => {
    const { useCase, command, repository, application } = fixture();
    application.result.subscriptionId = 'other-subscription';
    application.processingStatus = SubscriptionPaymentProcessingStatus.COMPLETED;
    application.boundProviderSubscriptionId = command.providerSubscriptionId;

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'BINDING_APPLICATION_MISMATCH' });
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it('rereads completion after waiting for the shared user lock', async () => {
    const { useCase, command, repository, application } = fixture();
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
      processingStatus: SubscriptionPaymentProcessingStatus.COMPLETED,
      boundProviderSubscriptionId: command.providerSubscriptionId,
    });
    releaseLock();

    await pending;
    expect(repository.findPaymentApplication).toHaveBeenCalledTimes(2);
    expect(repository.bindProviderSubscription).not.toHaveBeenCalled();
  });

  it('propagates write failure to the transaction owner', async () => {
    const { useCase, command, repository } = fixture();
    const error = new Error('write failed');
    repository.bindProviderSubscription.mockRejectedValue(error);

    await expect(useCase.execute(command)).rejects.toBe(error);
  });
});

function fixture() {
  const application: SubscriptionPaymentApplication = {
    paymentId: 'payment-id',
    userId: 42,
    previousSubscriptionId: 'old-subscription',
    processingStatus: SubscriptionPaymentProcessingStatus.BINDING_PENDING,
    boundProviderSubscriptionId: null,
    result: {
      subscriptionId: 'new-subscription',
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: '2026-12-01T00:00:00.000Z',
      previousProviderSubscriptionId: 'sub_old',
    },
  };
  const repository = {
    findCancellationApplications: vi.fn<SubscriptionsRepository['findCancellationApplications']>(),
    lockByUserId: vi.fn<SubscriptionsRepository['lockByUserId']>().mockResolvedValue(),
    findPaymentApplication: vi
      .fn<SubscriptionsRepository['findPaymentApplication']>()
      .mockResolvedValue(application),
    completeProviderSubscriptionCancellation: vi
      .fn<SubscriptionsRepository['completeProviderSubscriptionCancellation']>()
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
    command: new BindProviderSubscriptionCommand('payment-id', 'new-subscription', 'sub_new', {}),
    useCase: new BindProviderSubscriptionUseCase(repository),
  };
}
