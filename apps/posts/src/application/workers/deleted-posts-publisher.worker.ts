import { Injectable, Logger } from '@nestjs/common';
import { OutboxEventsRepository } from '../ports/outbox-events.repository.js';
import { PostsEventsPublisher } from '../ports/posts-events.publisher.js';
import { POST_DELETED_V1_EVENT_NAME } from '@app/message-broker';
import type { ApplicationOutboxEvent } from '../types/outbox.types.js';
import { PostDeletedOutboxEventMapper } from './mappers/post-deleted-outbox-event.mapper.js';

export type DeletedPostsBatchPublisherOptions = {
  batchSize: number;
  concurrency: number;
  maxAttempts: number;
};
@Injectable()
export class DeletedPostsPublisherWorker {
  private readonly logger = new Logger(DeletedPostsPublisherWorker.name);
  protected options: DeletedPostsBatchPublisherOptions = {
    batchSize: 100,
    concurrency: 10,
    maxAttempts: 5,
  };
  constructor(
    private readonly outbox: OutboxEventsRepository,
    private readonly publisher: PostsEventsPublisher,
  ) {}
  async run(): Promise<void> {
    try {
      const events = await this.outbox.findAvailableBatch(
        POST_DELETED_V1_EVENT_NAME,
        this.options.maxAttempts,
        this.options.batchSize,
      );
      if (!events) return;

      this.logger.debug(`Claimed post-deleted outbox batch: eventCount=${events.length}`);
      await this.processWithConcurrency(events, this.options.concurrency, (event) => this.processOne(event));
    } catch (error: unknown) {
      const message = this.errorMessage(error);
      this.logger.error(
        `Failed to claim ${POST_DELETED_V1_EVENT_NAME} outbox events: reason="${message}"`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async processOne(eventToProcess: ApplicationOutboxEvent) {
    try {
      const event = PostDeletedOutboxEventMapper.toIntegrationEvent(eventToProcess);
      await this.publisher.deletedPostEvent(event);
      await this.outbox.ensurePublished(event.eventId);

      this.logger.debug(
        `Published post-deleted outbox event: eventId=${eventToProcess.id} postId=${eventToProcess.aggregateId} attempt=${eventToProcess.attempts}`,
      );
    } catch (error: unknown) {
      const message = this.errorMessage(error);
      await this.handleProcessingFailure(eventToProcess, message);
    }
  }

  private async processWithConcurrency(
    items: readonly ApplicationOutboxEvent[],
    concurrency: number,
    handler: (item: ApplicationOutboxEvent) => Promise<void>,
  ): Promise<void> {
    let nextIndex = 0;

    async function consume(): Promise<void> {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await handler(item);
      }
    }
    const consumersCount = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: consumersCount }, () => consume()));
  }
  private async handleProcessingFailure(
    eventToProcess: ApplicationOutboxEvent,
    message: string,
  ): Promise<void> {
    this.logger.error(
      `Failed to publish post-deleted outbox event: eventId=${eventToProcess.id} postId=${eventToProcess.aggregateId} attempt=${eventToProcess.attempts} reason="${message}"`,
    );
    try {
      const resolved = await this.outbox.resolveFailedAttempt(
        eventToProcess.id,
        eventToProcess.availableAt,
        message,
        this.options.maxAttempts,
      );

      if (!resolved) {
        this.logger.warn(
          `Outbox publishing failure was not recorded because lease was lost: eventId=${eventToProcess.id}`,
        );
      }
    } catch (statusError) {
      this.logger.error(
        `Failed to record outbox publishing error: eventId=${eventToProcess.id} reason="${this.errorMessage(statusError)}"`,
        statusError instanceof Error ? statusError.stack : undefined,
      );
    }
  }
  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
