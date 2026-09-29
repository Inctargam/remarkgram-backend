import type { FileDeletionJobsWorker } from '../../application/workers/file-deletion-jobs.worker.js';
import { FileDeletionJobsScheduler } from './file-deletion-jobs.scheduler.js';

describe('FileDeletionJobsScheduler', () => {
  it('runs the deletion worker', async () => {
    const worker = { run: vi.fn().mockResolvedValue(undefined) };
    const scheduler = new FileDeletionJobsScheduler(worker as unknown as FileDeletionJobsWorker);

    await scheduler.handleCron();

    expect(worker.run).toHaveBeenCalledOnce();
  });

  it('does not reject when the worker fails', async () => {
    const worker = { run: vi.fn().mockRejectedValue(new Error('claim failed')) };
    const scheduler = new FileDeletionJobsScheduler(worker as unknown as FileDeletionJobsWorker);

    await expect(scheduler.handleCron()).resolves.toBeUndefined();
  });
});
