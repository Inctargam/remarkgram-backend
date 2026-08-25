import { FileDeletionJobStatus } from '../../../domain/enums/file-deletion-job-status.enum.js';
import type { PrismaService } from '../prisma.service.js';
import { PrismaFileDeletionJobsRepository } from './prisma-file-deletion-jobs.repository.js';

describe('PrismaFileDeletionJobsRepository', () => {
  const createMany = vi.fn();
  const updateMany = vi.fn();
  const queryRaw = vi.fn();
  const executeRaw = vi.fn();
  const prisma = {
    fileDeletionJob: { createMany, updateMany },
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
  };
  const repository = new PrismaFileDeletionJobsRepository(prisma as unknown as PrismaService);

  beforeEach(() => vi.clearAllMocks());

  it('creates jobs through the supplied transaction client', async () => {
    const transactionCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const ctx = {
      fileDeletionJob: { createMany: transactionCreateMany },
    };
    const data = [
      {
        fileId: '0e80fbd6-b60b-4776-82af-5b568de1f600',
        objectKey: 'object-key',
        availableAt: new Date('2026-08-22T15:00:00.000Z'),
      },
    ];

    await repository.addMany({ data }, ctx);

    expect(transactionCreateMany).toHaveBeenCalledWith({ data, skipDuplicates: true });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('creates jobs through the default Prisma client when no transaction is supplied', async () => {
    const data = [
      {
        fileId: '0e80fbd6-b60b-4776-82af-5b568de1f600',
        objectKey: 'object-key',
        availableAt: new Date('2026-08-22T15:00:00.000Z'),
      },
    ];
    createMany.mockResolvedValue({ count: 1 });

    await repository.addMany({ data });

    expect(createMany).toHaveBeenCalledOnce();
    expect(createMany).toHaveBeenCalledWith({ data, skipDuplicates: true });
  });

  it('does not call Prisma when there are no deletion jobs', async () => {
    await expect(repository.addMany({ data: [] })).resolves.toBeUndefined();

    expect(createMany).not.toHaveBeenCalled();
  });

  it('maps claimed database rows to application records', async () => {
    const leaseUntil = new Date('2026-08-21T15:02:00.000Z');
    queryRaw.mockResolvedValue([
      {
        file_id: '0e80fbd6-b60b-4776-82af-5b568de1f600',
        object_key: 'object-key',
        lease_until: leaseUntil,
      },
    ]);

    await expect(repository.findAvailableBatch({ batchSize: 100, maxAttempts: 10 })).resolves.toEqual([
      {
        fileId: '0e80fbd6-b60b-4776-82af-5b568de1f600',
        objectKey: 'object-key',
        leaseUntil,
      },
    ]);
  });

  it('returns null when no jobs were claimed', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(repository.findAvailableBatch({ batchSize: 100, maxAttempts: 10 })).resolves.toBeNull();
  });

  it('marks a job done only when the lease matches', async () => {
    const leaseUntil = new Date('2026-08-21T15:02:00.000Z');
    const completedAt = new Date('2026-08-21T15:01:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(completedAt);
    updateMany.mockResolvedValue({ count: 1 });

    await expect(repository.markAsDone('0e80fbd6-b60b-4776-82af-5b568de1f600', leaseUntil)).resolves.toBe(
      true,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        fileId: '0e80fbd6-b60b-4776-82af-5b568de1f600',
        status: FileDeletionJobStatus.PENDING,
        leaseUntil,
      },
      data: {
        status: FileDeletionJobStatus.DONE,
        doneAt: completedAt,
        leaseUntil: null,
        lastError: null,
      },
    });
    vi.useRealTimers();
  });

  it('returns false when the job lease no longer belongs to the worker', async () => {
    const leaseUntil = new Date('2026-08-21T15:02:00.000Z');
    updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.markAsDone('0e80fbd6-b60b-4776-82af-5b568de1f600', leaseUntil)).resolves.toBe(
      false,
    );
  });

  it('reports whether a failed attempt was resolved by the current lease owner', async () => {
    executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const leaseUntil = new Date('2026-08-21T15:02:00.000Z');

    await expect(
      repository.resolveFailedAttempt(
        '0e80fbd6-b60b-4776-82af-5b568de1f600',
        leaseUntil,
        'S3 unavailable',
        10,
      ),
    ).resolves.toBe(true);
    await expect(
      repository.resolveFailedAttempt(
        '0e80fbd6-b60b-4776-82af-5b568de1f600',
        leaseUntil,
        'S3 unavailable',
        10,
      ),
    ).resolves.toBe(false);
  });
});
