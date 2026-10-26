import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../../database/prisma.service.js';
import { PrismaPaymentsQueryRepository } from './prisma-payments.query-repository.js';

describe(PrismaPaymentsQueryRepository.name, () => {
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const count = vi.fn();
  const transaction = vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations));
  const repository = new PrismaPaymentsQueryRepository({
    payment: { findFirst, findMany, count },
    $transaction: transaction,
  } as unknown as PrismaService);

  it('looks up status by payment and owner in one condition', async () => {
    findFirst.mockResolvedValue(null);
    await expect(repository.findStatusByUserAndId(42, 'payment-id')).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'payment-id', userId: 42 } }),
    );
  });

  it('filters, orders and paginates payment history by owner', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(12);
    await expect(
      repository.findUserPaymentsPage({ userId: 42, pageNumber: 2, pageSize: 10 }),
    ).resolves.toEqual({
      items: [],
      totalCount: 12,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42 },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 10,
        take: 10,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { userId: 42 } });
  });
});
