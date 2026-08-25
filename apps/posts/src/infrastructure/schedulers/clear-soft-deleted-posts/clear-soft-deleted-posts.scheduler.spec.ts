import { ClearSoftDeletedPostsScheduler } from './clear-soft-deleted-posts.scheduler.js';
import { beforeEach, expect, vi } from 'vitest';
import { CommandBus } from '@nestjs/cqrs';
import { ClearSorfDeletedPostsCommand } from '../../../application/use-cases/clear-soft-deleted-posts/clear-soft-deleted-posts.js';

describe('ClearSoftDeletedPostsScheduler', () => {
  const BATCH_LIMIT = 100;
  const commandBus = {
    execute: vi.fn(),
  };
  const scheduler = new ClearSoftDeletedPostsScheduler(commandBus as unknown as CommandBus);

  beforeEach(() => {
    commandBus.execute.mockReset();
  });

  it('delegates the execution to the command bus', async () => {
    commandBus.execute.mockResolvedValue(undefined);
    await expect(scheduler.clear()).resolves.toBeUndefined();
    expect(commandBus.execute).toHaveBeenCalledWith(new ClearSorfDeletedPostsCommand(BATCH_LIMIT));
    expect(commandBus.execute).toHaveBeenCalledOnce();
  });
  it('trows when the command bus throws', async () => {
    commandBus.execute.mockRejectedValueOnce(new Error('Command bus error'));
    await expect(scheduler.clear()).resolves.toBeUndefined();
    expect(commandBus.execute).toHaveBeenCalledWith(new ClearSorfDeletedPostsCommand(BATCH_LIMIT));
    expect(commandBus.execute).toHaveBeenCalledOnce();
  });
});
