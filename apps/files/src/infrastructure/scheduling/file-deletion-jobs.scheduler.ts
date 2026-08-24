import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FileDeletionJobsWorker } from '../../application/workers/file-deletion-jobs.worker.js';

@Injectable()
export class FileDeletionJobsScheduler {
  private readonly logger = new Logger(FileDeletionJobsScheduler.name);

  constructor(private readonly worker: FileDeletionJobsWorker) {}

  @Cron(CronExpression.EVERY_5_SECONDS, { waitForCompletion: true })
  async handleCron(): Promise<void> {
    try {
      await this.worker.run();
    } catch (error) {
      this.logger.error(
        `File deletion scheduling failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
