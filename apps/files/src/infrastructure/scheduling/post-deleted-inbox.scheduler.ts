import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostDeletedInboxWorker } from '../../application/workers/post-deleted-inbox.worker.js';

@Injectable()
export class PostDeletedInboxScheduler {
  private readonly logger = new Logger(PostDeletedInboxScheduler.name);

  constructor(private postDeletedInboxWorker: PostDeletedInboxWorker) {}
  @Cron(CronExpression.EVERY_MINUTE)
  handleCron() {
    this.postDeletedInboxWorker.handle();
  }
}
