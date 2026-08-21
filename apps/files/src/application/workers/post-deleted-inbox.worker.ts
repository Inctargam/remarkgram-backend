import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../ports/unit-of-work.js';
import { InboxEventsRepository, InboxEventType } from '../ports/inbox-events.repository.js';
import { FilesRepository } from '../ports/files.repository.js';
import { POST_DELETED_V1_EVENT_NAME } from '@app/message-broker';
import { FileDeletionJobsRepository } from '../ports/file-deletion-jobs.repository.js';

export type PostDeletedInboxEventOptions = {
  batchSize: number;
  concurrency: number;
  maxAttempts: number;
  retentionMs: number;
};

class PostDeletedInboxLeaseLostError extends Error {
  constructor(eventId: string) {
    super(`Lease was lost for post-deleted inbox event ${eventId}`);
  }
}

class SoftDeletedFileTimestampMissingError extends Error {
  constructor(fileId: string) {
    super(`Soft-deleted file ${fileId} was returned without deletedAt`);
  }
}
@Injectable()
export class PostDeletedInboxWorker {
  private readonly logger = new Logger(PostDeletedInboxWorker.name);
  protected options: PostDeletedInboxEventOptions = {
    batchSize: 100,
    concurrency: 10,
    maxAttempts: 100,
    retentionMs: 24 * 60 * 60 * 1000, // 24 hours
  };
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly inbox: InboxEventsRepository,
    private readonly files: FilesRepository,
    private readonly fileDeletionJob: FileDeletionJobsRepository,
  ) {}

  async run(): Promise<void> {
    try {
      const events = await this.inbox.findAvailableBatch({
        maxAttempts: this.options.maxAttempts,
        batchSize: this.options.batchSize,
        eventType: POST_DELETED_V1_EVENT_NAME,
      });
      if (!events) return;

      this.logger.debug(`Claimed post-deleted inbox batch: eventCount=${events.length}`);
      await this.processWithConcurrency(events, this.options.concurrency, (event) => this.processOne(event));
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(`Failed to claim ${POST_DELETED_V1_EVENT_NAME} inbox events: reason="${message}"`);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async processOne(eventToProcess: InboxEventType): Promise<void> {
    try {
      await this.unitOfWork.run(async (ctx) => {
        const { payload } = eventToProcess;
        const fileIds = [...new Set(payload.fileIds)];

        const deletionData = await this.files.softDeleteFileIdsByUser(fileIds, payload.userId, ctx);

        if (deletionData.length !== fileIds.length) {
          this.logger.warn(
            `Post-deleted event matched only active owned files: eventId=${eventToProcess.eventId} postId=${payload.postId} requested=${fileIds.length} softDeleted=${deletionData.length}`,
          );
        }

        await this.fileDeletionJob.addMany(
          {
            data: deletionData.map((file) => {
              if (!file.deletedAt) throw new SoftDeletedFileTimestampMissingError(file.id);

              return {
                fileId: file.id,
                objectKey: file.objectKey,
                availableAt: new Date(file.deletedAt.getTime() + this.options.retentionMs),
              };
            }),
          },
          ctx,
        );
        // availableAt служит токеном аренды. Если аренда уже истекла и событие
        // забрал другой воркер, update вернёт 0 и вся транзакция soft-delete откатится.
        const processed = await this.inbox.markAsProcessed(
          eventToProcess.eventId,
          eventToProcess.availableAt,
          ctx,
        );
        if (!processed) throw new PostDeletedInboxLeaseLostError(eventToProcess.eventId);

        return;
      });
      this.logger.debug(
        `Processed post-deleted inbox event: eventId=${eventToProcess.eventId} postId=${eventToProcess.payload.postId}`,
      );
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(
        `Failed to process post-deleted inbox event: eventId=${eventToProcess.eventId} postId=${eventToProcess.payload.postId} attempt=${eventToProcess.attempts} reason="${message}"`,
      );
      try {
        const resolved = await this.inbox.resolveFailedAttempt(
          eventToProcess.eventId,
          eventToProcess.availableAt,
          message,
          this.options.maxAttempts,
        );

        if (!resolved) {
          this.logger.warn(
            `Post-deleted failure was not recorded because lease was lost: eventId=${eventToProcess.eventId}`,
          );
        }
      } catch (statusError) {
        this.logger.error(
          `Failed to record post-deleted processing error: eventId=${eventToProcess.eventId} reason="${this.errorMessage(statusError)}"`,
          statusError instanceof Error ? statusError.stack : undefined,
        );
      }
    }
  }

  private async processWithConcurrency(
    items: readonly InboxEventType[],
    concurrency: number,
    handler: (ctx: InboxEventType) => Promise<void>,
  ) {
    let nextIndex = 0;

    const consumer = async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex++;
        await handler(item);
      }
    };

    const consumers = Array.from(
      {
        length: Math.min(items.length, concurrency),
      },
      () => consumer(),
    );

    await Promise.all(consumers);
  }
}
