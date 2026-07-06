import type { PrismaService } from './prisma.service.js';
import { PrismaUnitOfWork } from './prisma-unit-of-work.js';

describe('PrismaUnitOfWork', () => {
  it('runs handler inside prisma transaction', async () => {
    const tx = { id: 'transaction-client' };
    const prisma = {
      $transaction: vi.fn(async (handler) => handler(tx)),
    };
    const unitOfWork = new PrismaUnitOfWork(prisma as unknown as PrismaService);
    const handler = vi.fn().mockResolvedValue('result');

    await expect(unitOfWork.run(handler)).resolves.toBe('result');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(tx);
  });
});
