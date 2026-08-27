import type { PrismaService } from '../prisma.service.js';
import { PrismaTestingRepository } from './prisma-testing.repository.js';

describe('PrismaTestingRepository', () => {
  it('truncates files data', async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(0);
    const prisma = { $executeRawUnsafe: executeRawUnsafe };
    const repository = new PrismaTestingRepository(prisma as unknown as PrismaService);

    await expect(repository.deleteAllData()).resolves.toBeUndefined();
    expect(executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'TRUNCATE TABLE "files", "image_upload_reservations" CASCADE',
    );
    expect(executeRawUnsafe).toHaveBeenNthCalledWith(2, 'TRUNCATE TABLE "inbox_events" CASCADE');
    expect(executeRawUnsafe).toHaveBeenNthCalledWith(3, 'TRUNCATE TABLE "file_deletion_jobs" CASCADE');
  });
});
