import type { FilesRepository } from '../ports/files.repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';
import type { TransactionContext, UnitOfWork } from '../ports/unit-of-work.js';
import { FileDeletionJobsWorker } from './file-deletion-jobs.worker.js';

describe('FileDeletionJobsWorker', () => {
  const leaseUntil = new Date('2026-08-21T15:02:00.000Z');
  const job = {
    fileId: '0e80fbd6-b60b-4776-82af-5b568de1f600',
    objectKey: 'users/1/images/file.jpg',
    leaseUntil,
  };
  const ctx = {} as TransactionContext;

  const jobs = {
    addMany: vi.fn(),
    findAvailableBatch: vi.fn(),
    markAsDone: vi.fn(),
    resolveFailedAttempt: vi.fn(),
  };
  const files = {
    hardDeleteSoftDeletedById: vi.fn(),
  };
  const objectStorage = {
    deleteObject: vi.fn(),
  };
  const unitOfWork = {
    run: vi.fn(async (handler: (transaction: TransactionContext) => Promise<unknown>) => handler(ctx)),
  };

  const worker = new FileDeletionJobsWorker(
    unitOfWork as unknown as UnitOfWork,
    jobs,
    files as unknown as FilesRepository,
    objectStorage as unknown as ObjectStorage,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    jobs.findAvailableBatch.mockResolvedValue([job]);
    jobs.markAsDone.mockResolvedValue(true);
    jobs.resolveFailedAttempt.mockResolvedValue(true);
    objectStorage.deleteObject.mockResolvedValue(undefined);
    files.hardDeleteSoftDeletedById.mockResolvedValue(undefined);
  });

  it('deletes the S3 object before atomically completing the job and deleting the file row', async () => {
    await worker.run();

    expect(objectStorage.deleteObject).toHaveBeenCalledWith(job.objectKey);
    expect(jobs.markAsDone).toHaveBeenCalledWith(job.fileId, leaseUntil, ctx);
    expect(files.hardDeleteSoftDeletedById).toHaveBeenCalledWith(job.fileId, ctx);
    expect(jobs.resolveFailedAttempt).not.toHaveBeenCalled();
    expect(objectStorage.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
      jobs.markAsDone.mock.invocationCallOrder[0],
    );
    expect(jobs.markAsDone.mock.invocationCallOrder[0]).toBeLessThan(
      files.hardDeleteSoftDeletedById.mock.invocationCallOrder[0],
    );
  });

  it('reschedules the job when S3 deletion fails', async () => {
    objectStorage.deleteObject.mockRejectedValue(new Error('S3 unavailable'));

    await worker.run();

    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(jobs.resolveFailedAttempt).toHaveBeenCalledWith(job.fileId, leaseUntil, 'S3 unavailable', 10);
  });

  it('does not hard-delete the file when the lease was lost', async () => {
    jobs.markAsDone.mockResolvedValue(false);

    await worker.run();

    expect(files.hardDeleteSoftDeletedById).not.toHaveBeenCalled();
    expect(jobs.resolveFailedAttempt).toHaveBeenCalledWith(
      job.fileId,
      leaseUntil,
      `Lease was lost for file deletion job ${job.fileId}`,
      10,
    );
  });

  it('does nothing when there are no available jobs', async () => {
    jobs.findAvailableBatch.mockResolvedValue(null);

    await worker.run();

    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });
});
