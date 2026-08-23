import type { PrismaService } from './prisma.service.js';
import { PrismaUnitOfWork } from './prisma-unit-of-work.js';

describe('PrismaUnitOfWork', () => {
  it('passes the Prisma transaction client to the application callback', async () => {
    const transactionClient = Symbol('transaction-client');
    const transaction = vi.fn((handler: (ctx: unknown) => Promise<number>) => handler(transactionClient));
    const unitOfWork = new PrismaUnitOfWork({ $transaction: transaction } as unknown as PrismaService);
    const handler = vi.fn().mockResolvedValue(10);

    await expect(unitOfWork.run(handler)).resolves.toBe(10);
    expect(handler).toHaveBeenCalledWith(transactionClient);
  });
});
