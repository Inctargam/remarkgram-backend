import type { DeletedPostsPublisherWorker } from '../../application/workers/deleted-posts-publisher.worker.js';
import { PublishDeletedPostEventScheduler } from './publish-deleted-post-event.scheduler.js';

describe('PublishDeletedPostEventScheduler', () => {
  it('waits for the publisher worker to complete', async () => {
    const worker = { run: vi.fn().mockResolvedValue(undefined) };
    const scheduler = new PublishDeletedPostEventScheduler(worker as unknown as DeletedPostsPublisherWorker);

    await scheduler.handleDeletePostEvent();

    expect(worker.run).toHaveBeenCalledOnce();
  });

  it('does not reject when the publisher worker fails unexpectedly', async () => {
    const worker = { run: vi.fn().mockRejectedValue(new Error('Claim failed')) };
    const scheduler = new PublishDeletedPostEventScheduler(worker as unknown as DeletedPostsPublisherWorker);

    await expect(scheduler.handleDeletePostEvent()).resolves.toBeUndefined();
  });
});
