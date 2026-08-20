import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeletedPostsPublisherWorker } from '../../application/workers/deleted-posts-publisher.worker.js';

@Injectable()
export class PublishDeletedPostEventScheduler {
  private readonly logger = new Logger(PublishDeletedPostEventScheduler.name);
  constructor(private worker: DeletedPostsPublisherWorker) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  handleDeletePostEvent() {
    this.logger.log('Cron job: Publish events deleted posts');
    this.worker.run();
  }
}
