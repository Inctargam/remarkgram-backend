import type { PostDeletedInboxWorker } from '../../application/workers/post-deleted-inbox.worker.js';
import { PostDeletedInboxScheduler } from './post-deleted-inbox.scheduler.js';

describe('PostDeletedInboxScheduler', () => {
  const worker = {
    run: vi.fn(),
  };
  const scheduler = new PostDeletedInboxScheduler(worker as unknown as PostDeletedInboxWorker);

  beforeEach(() => {
    worker.run.mockReset();
  });

  it('runs the post-deleted inbox worker', async () => {
    worker.run.mockResolvedValue(undefined);

    await expect(scheduler.handleCron()).resolves.toBeUndefined();

    expect(worker.run).toHaveBeenCalledOnce();
  });

  it.each([new Error('claim failed'), 'claim failed'])(
    'does not reject when the worker fails with %s',
    async (error) => {
      worker.run.mockRejectedValue(error);

      await expect(scheduler.handleCron()).resolves.toBeUndefined();

      expect(worker.run).toHaveBeenCalledOnce();
    },
  );
});
