import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../database/prisma.service.js';
import { MultipleActiveSubscriptionsError } from '../../application/errors/multiple-active-subscriptions.error.js';
import { PrismaSubscriptionsQueryRepository } from './prisma-subscriptions-query.repository.js';

describe('PrismaSubscriptionsQueryRepository.findActiveByUserId', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    [[], null],
    [[{ id: 'subscription-id' }], { subscriptionId: 'subscription-id' }],
  ] as const)('returns the D1 subscription context for %j', async (rows, expected) => {
    const { repository, findMany } = fixture();
    findMany.mockResolvedValue(rows);

    await expect(repository.findActiveByUserId(42)).resolves.toEqual(expected);
  });

  it('includes a started PENDING period and excludes future or expired access by dates', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-24T12:00:00.000Z');
    vi.setSystemTime(now);
    const { repository, findMany } = fixture();

    await repository.findActiveByUserId(42);

    expect(findMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        userId: 42,
        status: { in: ['ACTIVE', 'PENDING'] },
        startsAt: { lte: now },
        expiresAt: { gt: now },
      },
      select: { id: true },
      take: 2,
    });
  });

  it('does not hide overlapping current subscriptions behind a single result', async () => {
    const { repository, findMany } = fixture();
    findMany.mockResolvedValue([{ id: 'first' }, { id: 'second' }]);

    await expect(repository.findActiveByUserId(42)).rejects.toBeInstanceOf(MultipleActiveSubscriptionsError);
  });

  it('propagates a read failure rather than returning null', async () => {
    const { repository, findMany } = fixture();
    const error = new Error('database unavailable');
    findMany.mockRejectedValue(error);

    await expect(repository.findActiveByUserId(42)).rejects.toBe(error);
  });
});

function fixture() {
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = { subscription: { findMany } } as unknown as PrismaService;
  return { findMany, repository: new PrismaSubscriptionsQueryRepository(prisma) };
}
