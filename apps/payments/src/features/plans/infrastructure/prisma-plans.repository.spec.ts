import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../database/prisma.service.js';
import { Currency, PeriodUnit } from '../domain/plan.entity.js';
import {
  Currency as PrismaCurrency,
  PeriodUnit as PrismaPeriodUnit,
} from '../../../database/prisma/generated/enums.js';
import { PrismaPlansRepository } from './prisma-plans.repository.js';

describe('PrismaPlansRepository', () => {
  const findUnique = vi.fn();
  const prisma = { plan: { findUnique } };
  const repository = new PrismaPlansRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('finds and maps a persisted plan by id', async () => {
    findUnique.mockResolvedValue({
      id: 42,
      price: 5000,
      currency: PrismaCurrency.USD,
      periodCount: 1,
      periodUnit: PrismaPeriodUnit.WEEK,
    });

    await expect(repository.findById({ id: 42 })).resolves.toEqual({
      id: 42,
      price: 5000,
      currency: Currency.USD,
      periodCount: 1,
      periodUnit: PeriodUnit.WEEK,
    });
    expect(findUnique).toHaveBeenCalledOnce();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 42 } });
  });

  it('returns null when a plan does not exist', async () => {
    findUnique.mockResolvedValue(null);

    await expect(repository.findById({ id: 404 })).resolves.toBeNull();
  });

  it('does not hide persistence errors', async () => {
    const error = new Error('Database is unavailable');
    findUnique.mockRejectedValue(error);

    await expect(repository.findById({ id: 42 })).rejects.toBe(error);
  });
});
