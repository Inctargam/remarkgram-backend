import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../database/prisma.service.js';
import { PrismaPlansQueryRepository } from './prisma-plans.query-repository.js';

describe(PrismaPlansQueryRepository.name, () => {
  it('selects public plan fields ordered by ID', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaPlansQueryRepository({ plan: { findMany } } as unknown as PrismaService);

    await expect(repository.findAll()).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { id: 'asc' } }));
  });
});
