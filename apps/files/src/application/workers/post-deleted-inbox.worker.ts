import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../ports/unit-of-work.js';
import { InboxEventsRepository, InboxEventType } from '../ports/inbox-events.repository.js';
import { FilesRepository } from '../ports/files.repository.js';
import { POST_DELETED_V1_EVENT_NAME } from '@app/message-broker';
import { InvalidInboxEventPayloadError } from '../errors/invalid-inbox-event-payload.error.js';

const MAX_ATTEMPTS = 5;

@Injectable()
export class PostDeletedInboxWorker {
  private readonly logger = new Logger(PostDeletedInboxWorker.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly inbox: InboxEventsRepository,
    private readonly files: FilesRepository,
  ) {}

  async handle(): Promise<void> {
    let currentEvent: InboxEventType | null = null;
    try {
      await this.unitOfWork.run(async (ctx) => {
        const events = await this.inbox.findAvailableEventsByType(
          {
            eventType: POST_DELETED_V1_EVENT_NAME,
            limit: 1,
          },
          ctx,
        );
        if (!events || !Array.isArray(events) || events.length === 0) {
          return;
        }
        const event = events[0];
        currentEvent = event;
        const { payload } = event;

        if (!Array.isArray(payload.fileIds) || payload.fileIds.length === 0) {
          throw new InvalidInboxEventPayloadError('payload.fileIds must be a non-empty array');
        }
        await this.files.softDeleteFileIdsByUser(payload.fileIds, payload.userId, ctx);
        await this.inbox.markAsProcessed(event.eventId, ctx);
        return;
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const event = currentEvent as InboxEventType | null;

      if (!event) {
        this.logger.error(
          'Unexpected inbox worker error',
          error instanceof Error ? error.stack : String(error),
        );
        return;
      }

      this.logger.error(
        `Failed to process event ${event.eventId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      try {
        const nextAttempt = event.attempts + 1;

        if (error instanceof InvalidInboxEventPayloadError || nextAttempt >= MAX_ATTEMPTS) {
          await this.inbox.markDead(event.eventId, message);
          return;
        }

        await this.inbox.reschedule(event.eventId, message);
      } catch (statusError: unknown) {
        this.logger.error(
          `Failed to update status for inbox event ${event.eventId}: ${
            statusError instanceof Error ? statusError.message : String(statusError)
          }`,
          statusError instanceof Error ? statusError.stack : undefined,
        );
      }
    }
  }
}
