import type { PrismaService } from '../prisma.service.js';
import { PrismaTestingRepository } from './prisma-testing.repository.js';

describe('PrismaTestingRepository', () => {
  it('truncates files data and operation receipts', async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(0);
    const prisma = { $executeRawUnsafe: executeRawUnsafe };
    const repository = new PrismaTestingRepository(prisma as unknown as PrismaService);

    await expect(repository.deleteAllData()).resolves.toBeUndefined();
    expect(executeRawUnsafe).toHaveBeenCalledWith(
      'TRUNCATE TABLE "image_upload_operation_receipts", "files" CASCADE',
    );
  });
});
