import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxEventsRepository } from '../../application/ports/outbox-events.repository.js';
import { OutboxWorker } from '../../application/workers/outbox.worker.js';

@Injectable()
export class OutboxScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboxScheduler.name);

  constructor(
    private readonly worker: OutboxWorker,
    private readonly events: OutboxEventsRepository,
  ) {}

  onApplicationBootstrap(): void {
    void this.run();
  }

  @Cron(CronExpression.EVERY_6_HOURS, { waitForCompletion: true })
  async run(): Promise<void> {
    try {
      await this.worker.run();
      const historyBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await this.events.deletePublishedBefore(historyBefore);
    } catch (error) {
      this.logger.error(`Outbox scan failed: ${String(error)}`);
    }
  }
}
