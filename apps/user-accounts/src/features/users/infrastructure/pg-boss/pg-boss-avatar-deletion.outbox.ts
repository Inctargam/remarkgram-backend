import { Injectable, Logger } from '@nestjs/common';
import type { AvatarDeletionRequestedV1Event } from '@app/message-broker';
import { PgBoss, fromPrisma, type Job, type JobResult } from 'pg-boss';
import type { Prisma } from '../../../../database/generated/client.js';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';
import { AvatarDeletionOutbox } from '../../application/ports/avatar-deletion.outbox.js';
import { AvatarDeletionPublisher } from '../../application/ports/avatar-deletion.publisher.js';
import {
  AVATAR_DELETION_QUEUE,
  avatarDeletionQueueOptions,
  avatarDeletionWorkOptions,
} from './avatar-deletion-queue.options.js';

@Injectable()
export class PgBossAvatarDeletionOutbox extends AvatarDeletionOutbox {
  private readonly logger = new Logger(PgBossAvatarDeletionOutbox.name);
  private workerId?: string;

  constructor(
    private readonly boss: PgBoss,
    private readonly publisher: AvatarDeletionPublisher,
  ) {
    super();
    // Внутренние ошибки pg-boss; ошибки публикации конкретной задачи обрабатываем в publish().
    this.boss.on('error', (error) => this.logger.error(error));
  }

  async start(): Promise<void> {
    // Запускаем pg-boss и создаём очередь, если её ещё нет.
    await this.boss.start();
    await this.boss.createQueue(AVATAR_DELETION_QUEUE, avatarDeletionQueueOptions);
    // work() регистрирует наш обработчик пачек и возвращает ID локального worker для wake().
    this.workerId = await this.boss.work(
      AVATAR_DELETION_QUEUE,
      avatarDeletionWorkOptions,
      (jobs: Job<AvatarDeletionRequestedV1Event>[]) => this.publish(jobs),
    );
  }

  async stop(): Promise<void> {
    // Останавливаем обработку и закрываем собственные соединения pg-boss.
    await this.boss.stop();
    this.workerId = undefined;
  }

  async enqueue(event: AvatarDeletionRequestedV1Event, transaction: TransactionContext): Promise<void> {
    // send() сохраняет задачу в PostgreSQL. fromPrisma подключает ту же транзакцию,
    // что меняет профиль (а в SetAvatar сохраняет и checkpoint DBOS). RabbitMQ здесь не вызывается.
    await this.boss.send(AVATAR_DELETION_QUEUE, event, {
      // При повторах публикации ID сообщения остаётся прежним.
      id: event.eventId,
      db: fromPrisma(transaction as Prisma.TransactionClient),
    });
  }

  wake(): void {
    // Вызываем после commit: notifyWorker() будит локальный worker без ожидания RabbitMQ.
    // Если процесс упадёт до пробуждения, задачу найдёт резервный опрос.
    if (this.workerId) this.boss.notifyWorker(this.workerId);
  }

  private async publish(jobs: Job<AvatarDeletionRequestedV1Event>[]): Promise<JobResult[]> {
    // Наш обработчик: последовательно публикуем события и собираем обычный массив результатов.
    const results: JobResult[] = [];
    for (const job of jobs) {
      try {
        // Наш RabbitMQ-адаптер ждёт подтверждения брокера; это ещё не удаление файла в Files.
        await this.publisher.publish(job.data);
        results.push({ id: job.id, status: 'completed' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Avatar deletion publication failed; eventId=${job.id}: ${message}`);
        // pg-boss сохранит ошибку и назначит повтор, если лимит попыток ещё не исчерпан.
        results.push({ id: job.id, status: 'failed', output: { message } });
      }
    }
    // Благодаря perJobResults pg-boss сам сохранит результат каждой задачи после возврата массива.
    // Падение до сохранения может привести к повторной публикации: Files обрабатывает её идемпотентно.
    return results;
  }
}
