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
  @Cron(CronExpression.EVERY_12_HOURS, {
    waitForCompletion: true, //пока текущий handleCron() не завершился, следующий запуск не начинается (в рамках одного єкземпляра)
  })
  async handleCron() {
    try {
      await this.postDeletedInboxWorker.run();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Fallback inbox processing failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
