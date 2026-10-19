import type { FileDeletionJobsRepository } from '../ports/file-deletion-jobs.repository.js';
import type { FilesRepository } from '../ports/files.repository.js';
import type { InboxEventType } from '../ports/inbox-events.repository.js';
import type { TransactionContext, UnitOfWork } from '../ports/unit-of-work.js';
import { PostDeletedInboxWorker } from './post-deleted-inbox.worker.js';

describe('PostDeletedInboxWorker', () => {
  const ctx = {} as TransactionContext;
  const event: InboxEventType = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'posts.post-deleted.v1',
    payload: {
      postId: 42,
      userId: 7,
      fileIds: ['22222222-2222-4222-8222-222222222222'],
      deletedAt: '2026-08-21T12:00:00.000Z',
    },
    status: 'RECEIVED',
    attempts: 1,
    receivedAt: new Date('2026-08-21T12:00:00.000Z'),
    processedAt: null,
    availableAt: new Date('2026-08-21T12:02:00.000Z'),
    lastError: null,
  };
  const deletedAt = new Date('2026-08-21T12:01:00.000Z');
  const inbox = {
    add: vi.fn(),
    findAvailableBatch: vi.fn(),
    markAsProcessed: vi.fn(),
    resolveFailedAttempt: vi.fn(),
  };
  const files = { softDeleteFileIdsByUser: vi.fn() };
  const jobs = { addMany: vi.fn() };
  const unitOfWork = {
    run: vi.fn(async (handler: (transaction: TransactionContext) => Promise<unknown>) => handler(ctx)),
  };
  const worker = new PostDeletedInboxWorker(
    unitOfWork as unknown as UnitOfWork,
    inbox,
    files as unknown as FilesRepository,
    jobs as unknown as FileDeletionJobsRepository,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    inbox.findAvailableBatch.mockResolvedValue([event]);
    inbox.markAsProcessed.mockResolvedValue(true);
    inbox.resolveFailedAttempt.mockResolvedValue(true);
    files.softDeleteFileIdsByUser.mockResolvedValue([
      { id: event.payload.fileIds[0], objectKey: 'object-key', deletedAt },
    ]);
    jobs.addMany.mockResolvedValue(undefined);
  });

  it('soft-deletes files, creates deletion jobs and completes the inbox event in one transaction', async () => {
    await worker.run();

    expect(files.softDeleteFileIdsByUser).toHaveBeenCalledWith(event.payload.fileIds, 7, ctx);
    expect(jobs.addMany).toHaveBeenCalledWith(
      {
        data: [
          {
            fileId: event.payload.fileIds[0],
            objectKey: 'object-key',
            availableAt: new Date('2026-08-21T12:01:00.000Z'),
          },
        ],
      },
      ctx,
    );
    expect(inbox.markAsProcessed).toHaveBeenCalledWith(event.eventId, event.availableAt, ctx);
    expect(inbox.resolveFailedAttempt).not.toHaveBeenCalled();
  });

  it('treats no matching active files as an idempotent processed result', async () => {
    files.softDeleteFileIdsByUser.mockResolvedValue([]);

    await worker.run();

    expect(jobs.addMany).toHaveBeenCalledWith({ data: [] }, ctx);
    expect(inbox.markAsProcessed).toHaveBeenCalled();
    expect(inbox.resolveFailedAttempt).not.toHaveBeenCalled();
  });

  it('rolls back and records a failure when the inbox lease was lost', async () => {
    inbox.markAsProcessed.mockResolvedValue(false);

    await worker.run();

    expect(inbox.resolveFailedAttempt).toHaveBeenCalledWith(
      event.eventId,
      event.availableAt,
      `Lease was lost for post-deleted inbox event ${event.eventId}`,
      100,
    );
  });

  it('does nothing when no inbox events are available', async () => {
    inbox.findAvailableBatch.mockResolvedValue(null);

    await expect(worker.run()).resolves.toBeUndefined();

    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(files.softDeleteFileIdsByUser).not.toHaveBeenCalled();
  });

  it.each([new Error('Database unavailable'), 'Database unavailable'])(
    'contains an inbox claim failure: %s',
    async (error) => {
      inbox.findAvailableBatch.mockRejectedValue(error);

      await expect(worker.run()).resolves.toBeUndefined();

      expect(unitOfWork.run).not.toHaveBeenCalled();
      expect(inbox.resolveFailedAttempt).not.toHaveBeenCalled();
    },
  );

  it('removes duplicate file IDs before soft deletion', async () => {
    inbox.findAvailableBatch.mockResolvedValue([
      {
        ...event,
        payload: {
          ...event.payload,
          fileIds: [event.payload.fileIds[0], event.payload.fileIds[0]],
        },
      },
    ]);

    await worker.run();

    expect(files.softDeleteFileIdsByUser).toHaveBeenCalledWith([event.payload.fileIds[0]], 7, ctx);
    expect(jobs.addMany).toHaveBeenCalledWith(
      {
        data: [
          {
            fileId: event.payload.fileIds[0],
            objectKey: 'object-key',
            availableAt: deletedAt,
          },
        ],
      },
      ctx,
    );
  });

  it('records a failure when a soft-deleted file has no deletion timestamp', async () => {
    files.softDeleteFileIdsByUser.mockResolvedValue([
      { id: event.payload.fileIds[0], objectKey: 'object-key', deletedAt: null },
    ]);

    await worker.run();

    expect(inbox.markAsProcessed).not.toHaveBeenCalled();
    expect(inbox.resolveFailedAttempt).toHaveBeenCalledWith(
      event.eventId,
      event.availableAt,
      `Soft-deleted file ${event.payload.fileIds[0]} was returned without deletedAt`,
      100,
    );
  });

  it('records a transactional processing failure', async () => {
    jobs.addMany.mockRejectedValue(new Error('Jobs table unavailable'));

    await worker.run();

    expect(inbox.markAsProcessed).not.toHaveBeenCalled();
    expect(inbox.resolveFailedAttempt).toHaveBeenCalledWith(
      event.eventId,
      event.availableAt,
      'Jobs table unavailable',
      100,
    );
  });

  it.each([new Error('Status update failed'), 'Status update failed'])(
    'does not reject when the failed attempt cannot be recorded: %s',
    async (error) => {
      jobs.addMany.mockRejectedValue(new Error('Processing failed'));
      inbox.resolveFailedAttempt.mockRejectedValue(error);

      await expect(worker.run()).resolves.toBeUndefined();

      expect(inbox.resolveFailedAttempt).toHaveBeenCalledOnce();
    },
  );

  it('does not reject when the failed-attempt lease was already lost', async () => {
    jobs.addMany.mockRejectedValue(new Error('Processing failed'));
    inbox.resolveFailedAttempt.mockResolvedValue(false);

    await expect(worker.run()).resolves.toBeUndefined();

    expect(inbox.resolveFailedAttempt).toHaveBeenCalledOnce();
  });
});
