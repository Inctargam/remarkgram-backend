import type { PrismaService } from '../../../../database/prisma.service.js';
import { PrismaTestingRepository } from './prisma-testing.repository.js';

describe('PrismaTestingRepository', () => {
  it('truncates user data and resets identity sequences', async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(0);
    const prisma = { $executeRawUnsafe: executeRawUnsafe };
    const repository = new PrismaTestingRepository(prisma as unknown as PrismaService);

    await expect(repository.deleteAllData()).resolves.toBeUndefined();
    expect(executeRawUnsafe).toHaveBeenCalledWith('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
  });
});
