import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../database/prisma.service.js';
import { MultipleActiveSubscriptionsError } from '../../application/errors/multiple-active-subscriptions.error.js';
import { PrismaSubscriptionsQueryRepository } from './prisma-subscriptions-query.repository.js';

describe('PrismaSubscriptionsQueryRepository.hasActiveByUserId', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    [[], false],
    [[{ id: 'subscription-id' }], true],
  ] as const)('returns whether current access exists for %j', async (rows, expected) => {
    const { repository, findMany } = fixture();
    findMany.mockResolvedValue(rows);

    await expect(repository.hasActiveByUserId(42)).resolves.toEqual(expected);
  });

  it('includes a started PENDING period and excludes future or expired access by dates', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-24T12:00:00.000Z');
    vi.setSystemTime(now);
    const { repository, findMany } = fixture();

    await repository.hasActiveByUserId(42);

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

    await expect(repository.hasActiveByUserId(42)).rejects.toBeInstanceOf(MultipleActiveSubscriptionsError);
  });

  it('propagates a read failure rather than returning false', async () => {
    const { repository, findMany } = fixture();
    const error = new Error('database unavailable');
    findMany.mockRejectedValue(error);

    await expect(repository.hasActiveByUserId(42)).rejects.toBe(error);
  });
});

describe('PrismaSubscriptionsQueryRepository.findUsersForStatusRefresh', () => {
  it('groups users before limiting the batch and advances the user cursor', async () => {
    const { repository, groupBy } = fixture();
    const before = new Date('2026-11-03T10:00:00.000Z');
    groupBy.mockResolvedValue([{ userId: 43 }, { userId: 99 }]);

    await expect(repository.findUsersForStatusRefresh(before, 42)).resolves.toEqual([43, 99]);
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['userId'],
      where: expect.objectContaining({ userId: { gt: 42 } }),
      orderBy: { userId: 'asc' },
      take: 100,
    }));
    const [{ where }] = groupBy.mock.calls[0];
    expect(where.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: { in: ['ACTIVE', 'PENDING'] }, expiresAt: { lte: before } }),
      expect.objectContaining({ status: 'PENDING', startsAt: { lte: before } }),
    ]));
  });

  it('propagates selection errors so the scheduler can retry next time', async () => {
    const { repository, groupBy } = fixture();
    const failure = new Error('database unavailable');
    groupBy.mockRejectedValue(failure);

    await expect(repository.findUsersForStatusRefresh(new Date())).rejects.toBe(failure);
  });
});

function fixture() {
  const findMany = vi.fn().mockResolvedValue([]);
  const groupBy = vi.fn().mockResolvedValue([]);
  const prisma = { subscription: { findMany, groupBy } } as unknown as PrismaService;
  return { findMany, groupBy, repository: new PrismaSubscriptionsQueryRepository(prisma) };
}
