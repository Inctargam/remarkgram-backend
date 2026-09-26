import type { CommandBus } from '@nestjs/cqrs';
import { CleanupExpiredImageUploadsCommand } from '../../application/use-cases/cleanup-expired-image-uploads/cleanup-expired-image-uploads.use-case.js';
import { ExpiredImageUploadsCleanupJob } from './expired-image-uploads-cleanup.job.js';

describe('ExpiredImageUploadsCleanupJob', () => {
  const commandBus = {
    execute: vi.fn(),
  };
  const job = new ExpiredImageUploadsCleanupJob(commandBus as unknown as CommandBus);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the cleanup use case using the current time', async () => {
    const startedAt = new Date('2030-01-01T01:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(startedAt);
    commandBus.execute.mockResolvedValue(undefined);

    await expect(job.handle()).resolves.toBeUndefined();

    expect(commandBus.execute).toHaveBeenCalledOnce();
    expect(commandBus.execute.mock.calls[0]?.[0]).toEqual(new CleanupExpiredImageUploadsCommand(startedAt));
  });
});
