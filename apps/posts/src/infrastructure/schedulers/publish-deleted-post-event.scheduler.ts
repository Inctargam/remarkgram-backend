import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeletedPostsPublisherWorker } from '../../application/workers/deleted-posts-publisher.worker.js';

@Injectable()
export class PublishDeletedPostEventScheduler {
  private readonly logger = new Logger(PublishDeletedPostEventScheduler.name);
  constructor(private readonly worker: DeletedPostsPublisherWorker) {}

  @Cron(CronExpression.EVERY_6_HOURS, { waitForCompletion: true })
  async handleDeletePostEvent(): Promise<void> {
    try {
      await this.worker.run();
    } catch (error) {
      this.logger.error(
        `Scheduled post-deleted outbox publishing failed: reason="${
          error instanceof Error ? error.message : String(error)
        }"`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
