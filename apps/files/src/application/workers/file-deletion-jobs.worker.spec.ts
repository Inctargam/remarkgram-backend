import type { FilesRepository } from '../ports/files.repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';
import type { TransactionContext, UnitOfWork } from '../ports/unit-of-work.js';
import { FileDeletionJobsWorker } from './file-deletion-jobs.worker.js';

describe('FileDeletionJobsWorker', () => {
  const MAX_ATTEMPTS = 5;
  const leaseUntil = new Date('2026-08-21T15:02:00.000Z');
  const job = {
    fileId: '0e80fbd6-b60b-4776-82af-5b568de1f600',
    objectKey: 'users/1/images/file.jpg',
    leaseUntil,
  };
  const ctx = {} as TransactionContext;

  const jobs = {
    addMany: vi.fn(),
    claimBatch: vi.fn(),
    markAsDone: vi.fn(),
    recordFailure: vi.fn(),
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
    jobs.claimBatch.mockResolvedValue([job]);
    jobs.markAsDone.mockResolvedValue(true);
    jobs.recordFailure.mockResolvedValue(true);
    objectStorage.deleteObject.mockResolvedValue(undefined);
    files.hardDeleteSoftDeletedById.mockResolvedValue(undefined);
  });

  it('deletes the S3 object before atomically completing the job and deleting the file row', async () => {
    await worker.run();

    expect(objectStorage.deleteObject).toHaveBeenCalledWith(job.objectKey);
    expect(jobs.markAsDone).toHaveBeenCalledWith(job.fileId, leaseUntil, ctx);
    expect(files.hardDeleteSoftDeletedById).toHaveBeenCalledWith(job.fileId, ctx);
    expect(jobs.recordFailure).not.toHaveBeenCalled();
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
    expect(jobs.recordFailure).toHaveBeenCalledWith(job.fileId, leaseUntil, 'S3 unavailable', MAX_ATTEMPTS);
  });

  it('does not hard-delete the file or record failure when the lease was lost', async () => {
    jobs.markAsDone.mockResolvedValue(false);

    await worker.run();

    expect(files.hardDeleteSoftDeletedById).not.toHaveBeenCalled();
    expect(jobs.recordFailure).not.toHaveBeenCalled();
  });

  it('does nothing when there are no available jobs', async () => {
    jobs.claimBatch.mockResolvedValue([]);

    await worker.run();

    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it('propagates a claim failure to the scheduler without processing files', async () => {
    const error = new Error('Database unavailable');
    jobs.claimBatch.mockRejectedValueOnce(error);

    await expect(worker.run()).rejects.toBe(error);

    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
    expect(jobs.recordFailure).not.toHaveBeenCalled();
  });

  it('continues processing other jobs after losing a lease', async () => {
    const nextJob = { ...job, fileId: 'another-file', objectKey: 'another-key' };
    jobs.claimBatch.mockResolvedValue([job, nextJob]);
    jobs.markAsDone.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await worker.run();

    expect(files.hardDeleteSoftDeletedById).toHaveBeenCalledExactlyOnceWith(nextJob.fileId, ctx);
    expect(jobs.recordFailure).not.toHaveBeenCalled();
  });
});
