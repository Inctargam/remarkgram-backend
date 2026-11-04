import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentProvider } from '../../../../payments/domain/payment.entity.js';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { SubscriptionStatus } from '../../../domain/enums/subscription-status.enum.js';
import type { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import type { RecordBusinessAccessService } from '../../services/record-business-access.service.js';
import type { SubscriptionForPayment } from '../../types/subscriptions.types.js';
import { RefreshSubscriptionStatusesUseCase } from './refresh-subscription-statuses.use-case.js';

describe('RefreshSubscriptionStatusesUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('expires the old period before activating its successor and records only the final access', async () => {
    const current = subscription({
      subscriptionId: 'old',
      status: SubscriptionStatus.ACTIVE,
      startsAt: new Date('2026-10-03T12:00:00.000Z'),
      expiresAt: new Date('2026-11-03T12:00:00.000Z'),
    });
    const next = subscription();
    const { useCase, repository, accessEvents, tx } = fixture([current, next]);

    await useCase.execute(42, tx);

    expect(repository.markExpired).toHaveBeenCalledExactlyOnceWith(['old'], tx);
    expect(repository.markActive).toHaveBeenCalledExactlyOnceWith(['next'], tx);
    expect(repository.markExpired.mock.invocationCallOrder[0]).toBeLessThan(
      repository.markActive.mock.invocationCallOrder[0],
    );
    expect(repository.markActive.mock.invocationCallOrder[0]).toBeLessThan(
      accessEvents.execute.mock.invocationCallOrder[0],
    );
    expect(accessEvents.execute).toHaveBeenCalledExactlyOnceWith(42, tx, new Date());
  });

  it('expires a missed PENDING period without activating it', async () => {
    const { useCase, repository, accessEvents, tx } = fixture([
      subscription({
        startsAt: new Date('2026-10-01T00:00:00.000Z'),
        expiresAt: new Date('2026-11-01T00:00:00.000Z'),
      }),
    ]);

    await useCase.execute(42, tx);

    expect(repository.markExpired).toHaveBeenCalledExactlyOnceWith(['next'], tx);
    expect(repository.markActive).not.toHaveBeenCalled();
    expect(accessEvents.execute).toHaveBeenCalledOnce();
  });

  it('does not write or emit on a repeated pass or for a future period', async () => {
    const { useCase, repository, accessEvents, tx } = fixture([
      subscription({ status: SubscriptionStatus.ACTIVE }),
      subscription({
        subscriptionId: 'future',
        startsAt: new Date('2026-12-03T12:00:00.000Z'),
        expiresAt: new Date('2027-01-03T12:00:00.000Z'),
      }),
      subscription({
        subscriptionId: 'past',
        status: SubscriptionStatus.EXPIRED,
        expiresAt: new Date('2026-11-01T00:00:00.000Z'),
      }),
    ]);

    await useCase.execute(42, tx);
    await useCase.execute(42, tx);

    expect(repository.markExpired).not.toHaveBeenCalled();
    expect(repository.markActive).not.toHaveBeenCalled();
    expect(accessEvents.execute).not.toHaveBeenCalled();
  });

  it('waits for the common user lock and uses the state and time after waiting', async () => {
    const { useCase, repository, accessEvents, tx } = fixture([]);
    let release!: () => void;
    repository.lockByUserId.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));

    const pending = useCase.execute(42, tx);
    expect(repository.lockByUserId).toHaveBeenCalledWith(42, tx);
    expect(repository.findByUserId).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-12-03T12:00:00.000Z'));
    repository.findByUserId.mockResolvedValue([subscription()]);
    release();
    await pending;

    expect(repository.markExpired).toHaveBeenCalledWith(['next'], tx);
    expect(repository.markActive).not.toHaveBeenCalled();
    expect(accessEvents.execute).toHaveBeenCalledWith(42, tx, new Date());
  });

  it('propagates an event failure to roll back the caller transaction', async () => {
    const { useCase, accessEvents, tx } = fixture([subscription()]);
    const failure = new Error('outbox unavailable');
    accessEvents.execute.mockRejectedValue(failure);

    await expect(useCase.execute(42, tx)).rejects.toBe(failure);
  });

  it('does not record access when saving a status failed', async () => {
    const { useCase, repository, accessEvents, tx } = fixture([subscription()]);
    const failure = new Error('database unavailable');
    repository.markActive.mockRejectedValue(failure);

    await expect(useCase.execute(42, tx)).rejects.toBe(failure);
    expect(accessEvents.execute).not.toHaveBeenCalled();
  });
});

function fixture(subscriptions: SubscriptionForPayment[]) {
  const repository = {
    lockByUserId: vi.fn<SubscriptionsRepository['lockByUserId']>().mockResolvedValue(),
    findByUserId: vi.fn<SubscriptionsRepository['findByUserId']>().mockResolvedValue(subscriptions),
    markExpired: vi.fn<SubscriptionsRepository['markExpired']>().mockResolvedValue(),
    markActive: vi.fn<SubscriptionsRepository['markActive']>().mockResolvedValue(),
  };
  const accessEvents = { execute: vi.fn<RecordBusinessAccessService['execute']>().mockResolvedValue() };
  return {
    repository,
    accessEvents,
    tx: {},
    useCase: new RefreshSubscriptionStatusesUseCase(
      repository as unknown as SubscriptionsRepository,
      accessEvents as unknown as RecordBusinessAccessService,
    ),
  };
}

function subscription(overrides: Partial<SubscriptionForPayment> = {}): SubscriptionForPayment {
  return {
    subscriptionId: 'next',
    planId: 1,
    provider: PaymentProvider.STRIPE,
    providerSubscriptionId: 'sub_provider',
    startsAt: new Date('2026-11-03T12:00:00.000Z'),
    expiresAt: new Date('2026-12-03T12:00:00.000Z'),
    status: SubscriptionStatus.PENDING,
    autoRenewalStatus: AutoRenewalStatus.ENABLED,
    ...overrides,
  };
}
