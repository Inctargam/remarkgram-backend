import type { FilesRepository } from '../../ports/files.repository.js';
import type { FileDeletionJobsRepository } from '../../ports/file-deletion-jobs.repository.js';
import type { UnitOfWork } from '../../ports/unit-of-work.js';
import {
  ScheduleAttachedFileDeletionCommand,
  ScheduleAttachedFileDeletionUseCase,
} from './schedule-attached-file-deletion.use-case.js';

describe('ScheduleAttachedFileDeletionUseCase', () => {
  const ctx = {};
  const files = { softDeleteAttachedFile: vi.fn() };
  const jobs = { addMany: vi.fn() };
  const uow = { run: vi.fn((fn: (ctx: unknown) => Promise<void>) => fn(ctx)) };
  const useCase = new ScheduleAttachedFileDeletionUseCase(
    files as unknown as FilesRepository,
    jobs as unknown as FileDeletionJobsRepository,
    uow as unknown as UnitOfWork,
  );
  const params = { userId: 42, fileId: '11111111-1111-4111-8111-111111111111' };
  beforeEach(() => {
    vi.clearAllMocks();
    jobs.addMany.mockResolvedValue(undefined);
  });

  it('soft-deletes and enqueues in the same transaction', async () => {
    const deletedAt = new Date();
    files.softDeleteAttachedFile.mockResolvedValue([{ id: params.fileId, objectKey: 'key', deletedAt }]);
    await useCase.execute(new ScheduleAttachedFileDeletionCommand(params));
    expect(files.softDeleteAttachedFile).toHaveBeenCalledWith(params.fileId, 42, ctx);
    expect(jobs.addMany).toHaveBeenCalledWith(
      { data: [{ fileId: params.fileId, objectKey: 'key', availableAt: deletedAt }] },
      ctx,
    );
  });

  it('accepts a repeated deletion without another job', async () => {
    files.softDeleteAttachedFile.mockResolvedValue([]);
    await useCase.execute(new ScheduleAttachedFileDeletionCommand(params));
    expect(jobs.addMany).toHaveBeenCalledWith({ data: [] }, ctx);
  });

  it('does not hide an enqueue failure from the transaction', async () => {
    files.softDeleteAttachedFile.mockResolvedValue([
      { id: params.fileId, objectKey: 'key', deletedAt: new Date() },
    ]);
    jobs.addMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(useCase.execute(new ScheduleAttachedFileDeletionCommand(params))).rejects.toThrow(
      'database unavailable',
    );
  });
});
