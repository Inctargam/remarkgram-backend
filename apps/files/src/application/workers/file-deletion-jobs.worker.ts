import { Injectable, Logger } from '@nestjs/common';
import { FileDeletionJobsRepository } from '../ports/file-deletion-jobs.repository.js';
import { FilesRepository } from '../ports/files.repository.js';
import { ObjectStorage } from '../ports/object-storage.js';
import { UnitOfWork } from '../ports/unit-of-work.js';

export type FileDeletionJobsWorkerOptions = {
  batchSize: number;
  concurrency: number;
  maxAttempts: number;
};

type ClaimedFileDeletionJob = {
  fileId: string;
  objectKey: string;
  leaseUntil: Date;
};

class FileDeletionJobLeaseLostError extends Error {
  constructor(fileId: string) {
    super(`Lease was lost for file deletion job ${fileId}`);
  }
}

@Injectable()
export class FileDeletionJobsWorker {
  private readonly logger = new Logger(FileDeletionJobsWorker.name);
  protected readonly options: FileDeletionJobsWorkerOptions = {
    batchSize: 100,
    concurrency: 10,
    maxAttempts: 5,
  };

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly jobs: FileDeletionJobsRepository,
    private readonly files: FilesRepository,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async run(): Promise<void> {
    try {
      const jobs = await this.jobs.findAvailableBatch({
        batchSize: this.options.batchSize,
        maxAttempts: this.options.maxAttempts,
      });

      if (!jobs) return;

      await this.processWithConcurrency(jobs, this.options.concurrency, (job) => this.processOne(job));
    } catch (error) {
      this.logger.error(
        `Failed to claim file deletion jobs: ${this.errorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async processOne(job: ClaimedFileDeletionJob): Promise<void> {
    try {
      // The network call deliberately stays outside a database transaction.
      // Repeating DeleteObject is safe when a previous response was lost.
      await this.objectStorage.deleteObject(job.objectKey);

      await this.unitOfWork.run(async (ctx) => {
        // Fence stale workers before deleting the File row. If this update does
        // not own the current lease, throwing rolls back the whole transaction.
        const completed = await this.jobs.markAsDone(job.fileId, job.leaseUntil, ctx);
        if (!completed) throw new FileDeletionJobLeaseLostError(job.fileId);

        await this.files.hardDeleteSoftDeletedById(job.fileId, ctx);
      });
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(`Failed to delete file ${job.fileId}: ${message}`);

      try {
        const resolved = await this.jobs.resolveFailedAttempt(
          job.fileId,
          job.leaseUntil,
          message,
          this.options.maxAttempts,
        );

        if (!resolved) {
          this.logger.warn(`Failed deletion attempt was not recorded for file ${job.fileId}: lease was lost`);
        }
      } catch (statusError) {
        this.logger.error(
          `Failed to record deletion attempt for file ${job.fileId}: ${this.errorMessage(statusError)}`,
          statusError instanceof Error ? statusError.stack : undefined,
        );
      }
    }
  }

  private async processWithConcurrency<T>(
    items: readonly T[],
    concurrency: number,
    handler: (item: T) => Promise<void>,
  ): Promise<void> {
    let nextIndex = 0;

    const consumer = async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex++];
        await handler(item);
      }
    };

    await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, () => consumer()));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
