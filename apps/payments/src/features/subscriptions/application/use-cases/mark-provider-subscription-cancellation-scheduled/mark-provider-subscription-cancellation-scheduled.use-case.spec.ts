import { describe, expect, it, vi } from 'vitest';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionPaymentProcessingStatus } from '../../../domain/enums/subscription-payment-processing-status.enum.js';
import type { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import type { SubscriptionPaymentApplication } from '../../types/subscriptions.types.js';
import {
  MarkProviderSubscriptionCancellationScheduledCommand,
  MarkProviderSubscriptionCancellationScheduledUseCase,
} from './mark-provider-subscription-cancellation-scheduled.use-case.js';

describe('MarkProviderSubscriptionCancellationScheduledUseCase', () => {
  it('resolves the payment from the original D1 subscription/provider arguments', async () => {
    const { useCase, command, repository } = fixture();

    await useCase.execute(command);

    expect(repository.lockByUserId).toHaveBeenCalledExactlyOnceWith(42, command.tx);
    expect(repository.findCancellationApplications).toHaveBeenCalledTimes(2);
    expect(repository.findCancellationApplications).toHaveBeenNthCalledWith(
      2,
      command.subscriptionId,
      command.providerSubscriptionId,
      command.tx,
    );
    expect(repository.completeProviderSubscriptionCancellation).toHaveBeenCalledExactlyOnceWith(
      {
        paymentId: 'payment-id',
        autoRenewalStatus: AutoRenewalStatus.RETIRED,
        processingStatus: SubscriptionPaymentProcessingStatus.BINDING_PENDING,
      },
      command.tx,
    );
  });

  it.each([
    SubscriptionPaymentProcessingStatus.BINDING_PENDING,
    SubscriptionPaymentProcessingStatus.COMPLETED,
  ])('replays %s without loading or changing subscription states', async (processingStatus) => {
    const { useCase, command, repository, application } = fixture();
    application.processingStatus = processingStatus;

    await expect(useCase.execute(command)).resolves.toBeUndefined();
    expect(repository.completeProviderSubscriptionCancellation).not.toHaveBeenCalled();
    expect(repository.findByUserId).not.toHaveBeenCalled();
  });

  it('rereads the stage after waiting for the shared user lock', async () => {
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
    expect(repository.findCancellationApplications).toHaveBeenCalledTimes(1);
    repository.findCancellationApplications.mockResolvedValue([
      { ...application, processingStatus: SubscriptionPaymentProcessingStatus.BINDING_PENDING },
    ]);
    releaseLock();

    await pending;
    expect(repository.findCancellationApplications).toHaveBeenCalledTimes(2);
    expect(repository.completeProviderSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it.each([false, true])('rejects a missing or mismatched provider link afterLock=%s', async (afterLock) => {
    const { useCase, command, repository, application } = fixture();
    repository.findCancellationApplications.mockResolvedValue([]);
    if (afterLock) repository.findCancellationApplications.mockResolvedValueOnce([application]);

    await expect(useCase.execute(command)).rejects.toMatchObject({
      subscriptionId: command.subscriptionId,
      reason: 'APPLICATION_NOT_FOUND',
    });
    expect(repository.completeProviderSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it.each([false, true])('rejects an ambiguous operation afterLock=%s', async (afterLock) => {
    const { useCase, command, repository, application } = fixture();
    repository.findCancellationApplications.mockResolvedValue([
      application,
      { ...application, paymentId: 'other-payment' },
    ]);
    if (afterLock) repository.findCancellationApplications.mockResolvedValueOnce([application]);

    await expect(useCase.execute(command)).rejects.toMatchObject({ reason: 'AMBIGUOUS_APPLICATION' });
    expect(repository.completeProviderSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it('requires the saved old local link', async () => {
    const { useCase, command, repository, application } = fixture();
    application.previousSubscriptionId = null;

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
  const application: SubscriptionPaymentApplication = {
    paymentId: 'payment-id',
    userId: 42,
    previousSubscriptionId: 'old-subscription',
    processingStatus: SubscriptionPaymentProcessingStatus.CANCELLATION_PENDING,
    boundProviderSubscriptionId: null,
    result: {
      subscriptionId: 'new-subscription',
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: '2026-12-01T00:00:00.000Z',
      previousProviderSubscriptionId: 'sub_old',
    },
  };
  const repository = {
    findCancellationApplications: vi
      .fn<SubscriptionsRepository['findCancellationApplications']>()
      .mockResolvedValue([application]),
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
    application,
    command: new MarkProviderSubscriptionCancellationScheduledCommand('new-subscription', 'sub_old', {}),
    useCase: new MarkProviderSubscriptionCancellationScheduledUseCase(repository),
  };
}
