import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../ports/unit-of-work.js';
import { InboxEventsRepository, InboxEventType } from '../ports/inbox-events.repository.js';
import { FilesRepository } from '../ports/files.repository.js';
import { POST_DELETED_V1_EVENT_NAME } from '@app/message-broker';

export type PostDeletedInboxEventOptions = {
  batchSize: number;
  concurrency: number;
  maxAttempts: number;
};
@Injectable()
export class PostDeletedInboxWorker {
  private readonly logger = new Logger(PostDeletedInboxWorker.name);
  protected options: PostDeletedInboxEventOptions = {
    batchSize: 100,
    concurrency: 10,
    maxAttempts: 100,
  };
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly inbox: InboxEventsRepository,
    private readonly files: FilesRepository,
  ) {}

  async run(): Promise<void> {
    try {
      const events = await this.inbox.findAvailableBatch({
        maxAttempts: this.options.maxAttempts,
        batchSize: this.options.batchSize,
        eventType: POST_DELETED_V1_EVENT_NAME,
      });
      if (!events || !Array.isArray(events)) {
        return;
      }
      await this.processWithConcurrency(events, this.options.concurrency, (event) => this.processOne(event));
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(`Failed processing POST_DELETED_V1_EVENT_NAME event: ${message}`);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async processOne(eventToProcess: InboxEventType): Promise<void> {
    try {
      await this.unitOfWork.run(async (ctx) => {
        const { payload } = eventToProcess;

        await this.files.softDeleteFileIdsByUser(payload.fileIds, payload.userId, ctx);
        // availableAt служит токеном аренды. Если аренда уже истекла и событие
        // забрал другой воркер, update вернёт 0 и вся транзакция soft-delete откатится.
        await this.inbox.markAsProcessed(eventToProcess.eventId, eventToProcess.availableAt, ctx);
        return;
      });
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(`Failed to mark soft-delete file: ${message}`);
      try {
        const resolved = await this.inbox.resolveFailedAttempt(
          eventToProcess.eventId,
          eventToProcess.availableAt,
          message,
          this.options.maxAttempts,
        );

        if (!resolved) {
          this.logger.warn(
            `Failed attempt was not recorded for event ${eventToProcess.eventId}: lease was lost`,
          );
        }
      } catch (statusError) {
        this.logger.error(
          `Failed to record failed attempt for event ${eventToProcess.eventId}: ${this.errorMessage(statusError)}`,
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

  // private async processException(event: InboxEventType, error: unknown): Promise<void> {
  //   const message = error instanceof Error ? error.message : String(error);
  //   this.logger.error(
  //     `Failed to process event ${event.eventId}: ${message}`,
  //     error instanceof Error ? error.stack : undefined,
  //   );
  //
  //   try {
  //     const nextAttempt = event.attempts + 1;
  //
  //     if (error instanceof InvalidInboxEventPayloadError || nextAttempt >= MAX_ATTEMPTS) {
  //       const result = await this.inbox.markDead(event.eventId, event.availableAt, message);
  //       if (!result) {
  //         this.logger.warn(`Inbox event ${event.eventId} was not marked as dead because its lease was lost`);
  //       }
  //       // this.logger.error(
  //       //   `Marking inbox event ${event.eventId} as dead for ${result} attempts`,
  //       //   error instanceof Error ? error.stack : undefined,
  //       // );
  //     } else {
  //       const result = await this.inbox.reschedule(event.eventId, event.availableAt, message);
  //       if (!result) {
  //         this.logger.warn(`Inbox event ${event.eventId} was not rescheduled because its lease was lost`);
  //       }
  //     }
  //   } catch (statusError: unknown) {
  //     this.logger.error(
  //       `Failed to update status for inbox event ${event.eventId}: ${
  //         statusError instanceof Error ? statusError.message : String(statusError)
  //       }`,
  //       statusError instanceof Error ? statusError.stack : undefined,
  //     );
  //   }
  // }
}
