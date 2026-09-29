import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ClearSorfDeletedPostsCommand } from '../../../application/use-cases/clear-soft-deleted-posts/clear-soft-deleted-posts.js';

@Injectable()
export class ClearSoftDeletedPostsScheduler {
  private readonly logger = new Logger(ClearSoftDeletedPostsScheduler.name);
  constructor(private readonly commandBus: CommandBus) {}
  @Cron(CronExpression.EVERY_12_HOURS, { waitForCompletion: true })
  async clear() {
    try {
      await this.commandBus.execute(new ClearSorfDeletedPostsCommand(500));
    } catch (error) {
      this.logger.error('Clearing soft deleted posts failed', error);
    }
  }
}
