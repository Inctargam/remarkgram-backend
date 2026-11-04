import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { PaymentsTransactionContext } from '../../../payments/application/ports/payments-unit-of-work.js';
import type { PrismaService } from '../../../../database/prisma.service.js';
import type { SubscriptionsQueryRepository } from '../../application/ports/subscriptions-query.repository.js';
import type { RefreshSubscriptionStatusesUseCase } from '../../application/use-cases/refresh-subscription-statuses/refresh-subscription-statuses.use-case.js';
import { SubscriptionStatusesScheduler } from './subscription-statuses.scheduler.js';

describe('SubscriptionStatusesScheduler', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('uses one transaction per user and advances the cursor even after a user failure', async () => {
    const { scheduler, queries, refresh, prisma } = fixture();
    queries.findUsersForStatusRefresh
      .mockResolvedValueOnce([2, 7])
      .mockResolvedValueOnce([11])
      .mockResolvedValueOnce([]);
    refresh.execute.mockImplementation((userId) => {
      if (userId === 2) return Promise.reject(new Error('failed user'));
      return Promise.resolve();
    });

    await scheduler.handle();

    expect(refresh.execute.mock.calls.map(([userId]) => userId)).toEqual([2, 7, 11]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    const before = queries.findUsersForStatusRefresh.mock.calls[0][0];
    expect(queries.findUsersForStatusRefresh.mock.calls).toEqual([
      [before, undefined], [before, 7], [before, 11],
    ]);
    expect(Logger.prototype.error).toHaveBeenCalledWith('Subscription status refresh failed; userId=2');
  });

  it('waits for a user transaction before starting the next one', async () => {
    const { scheduler, queries, refresh } = fixture();
    queries.findUsersForStatusRefresh.mockResolvedValueOnce([1, 2]).mockResolvedValueOnce([]);
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    refresh.execute.mockImplementationOnce(() => {
      started();
      return new Promise<void>((resolve) => { release = resolve; });
    });

    const pending = scheduler.handle();
    await entered;
    expect(refresh.execute).toHaveBeenCalledTimes(1);
    release();
    await pending;

    expect(refresh.execute).toHaveBeenCalledTimes(2);
  });

  it('logs a scan failure and lets a later cron attempt scan again', async () => {
    const { scheduler, queries, prisma } = fixture();
    queries.findUsersForStatusRefresh.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(scheduler.handle()).resolves.toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalledWith('Subscription status scan failed');

    queries.findUsersForStatusRefresh.mockResolvedValue([]);
    await expect(scheduler.handle()).resolves.toBeUndefined();
    expect(queries.findUsersForStatusRefresh).toHaveBeenCalledTimes(2);
  });
});

function fixture() {
  const queries = {
    findUsersForStatusRefresh: vi.fn<SubscriptionsQueryRepository['findUsersForStatusRefresh']>()
      .mockResolvedValue([]),
  };
  const refresh = { execute: vi.fn<RefreshSubscriptionStatusesUseCase['execute']>().mockResolvedValue() };
  const prisma = {
    $transaction: vi.fn((run: (tx: PaymentsTransactionContext) => Promise<void>) => run({})),
  };
  return {
    queries,
    refresh,
    prisma,
    scheduler: new SubscriptionStatusesScheduler(
      prisma as unknown as PrismaService,
      queries as unknown as SubscriptionsQueryRepository,
      refresh as unknown as RefreshSubscriptionStatusesUseCase,
    ),
  };
}
