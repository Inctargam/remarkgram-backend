import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostDeletedInboxWorker } from '../../application/workers/post-deleted-inbox.worker.js';

@Injectable()
export class PostDeletedInboxScheduler {
  private readonly logger = new Logger(PostDeletedInboxScheduler.name);

  constructor(private postDeletedInboxWorker: PostDeletedInboxWorker) {}
  /**
   * Страховочный запуск inbox worker.
   *
   * Основная обработка инициируется consumer сразу после сохранения события.
   * Cron редко запускает worker для восстановления событий, которые остались
   * необработанными после остановки или падения процесса, не создавая частый
   * polling и лишние пробуждения compute Neon.
   */
  @Cron(CronExpression.EVERY_5_SECONDS, {})
  handleCron() {
    this.postDeletedInboxWorker.run().catch();
  }
}
