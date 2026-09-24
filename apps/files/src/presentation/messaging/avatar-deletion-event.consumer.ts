import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  AVATAR_DELETION_REQUESTED_V1_EVENT_NAME,
  type AvatarDeletionRequestedV1Event,
} from '@app/message-broker';
import { isUUID } from 'class-validator';
import {
  ScheduleAttachedFileDeletionCommand,
  ScheduleAttachedFileDeletionUseCase,
} from '../../application/use-cases/schedule-attached-file-deletion/schedule-attached-file-deletion.use-case.js';
import { FileDeletionJobsWorker } from '../../application/workers/file-deletion-jobs.worker.js';
import { ImageUploadStateConflictError } from '../../application/errors/image-upload.errors.js';

// Проверяем данные из брокера во время выполнения; после true TypeScript знает тип события.
function isAvatarDeletionEvent(value: unknown): value is AvatarDeletionRequestedV1Event {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<AvatarDeletionRequestedV1Event>;
  return (
    typeof event.eventId === 'string' &&
    isUUID(event.eventId, '4') &&
    event.eventType === AVATAR_DELETION_REQUESTED_V1_EVENT_NAME &&
    !!event.data &&
    typeof event.data.userId === 'number' &&
    Number.isSafeInteger(event.data.userId) &&
    event.data.userId > 0 &&
    typeof event.data.fileId === 'string' &&
    isUUID(event.data.fileId, '4')
  );
}

@Controller()
export class AvatarDeletionEventConsumer {
  private readonly logger = new Logger(AvatarDeletionEventConsumer.name);
  constructor(
    private readonly deletion: ScheduleAttachedFileDeletionUseCase,
    private readonly worker: FileDeletionJobsWorker,
  ) {}

  // Nest вызывает этот метод для события files.avatar-deletion-requested.v1.
  @EventPattern(AVATAR_DELETION_REQUESTED_V1_EVENT_NAME)
  async handle(@Payload() data: unknown, @Ctx() context: RmqContext): Promise<void> {
    // Канал и исходное сообщение нужны для ручного подтверждения доставки (noAck: false).
    const channel = context.getChannelRef() as {
      ack(message: unknown): void;
      nack(message: unknown, all: boolean, requeue: boolean): void;
    };

    const message = context.getMessage();

    if (!isAvatarDeletionEvent(data)) {
      this.logger.warn('Rejected invalid avatar deletion message');
      // nack(message, all, requeue): отклоняем только это сообщение без возврата в очередь.
      channel.nack(message, false, false);
      return;
    }

    try {
      // В транзакции помечаем файл удалённым и сохраняем FileDeletionJob; S3 пока не вызываем.
      await this.deletion.execute(
        new ScheduleAttachedFileDeletionCommand({
          // Аргумент data — всё событие, а data.data — его полезные данные.
          userId: data.data.userId,
          fileId: data.data.fileId.toLowerCase(),
        }),
      );
    } catch (error) {
      this.logger.error(`Avatar deletion failed: eventId=${data.eventId}: ${String(error)}`);
      // Конфликт состояния отклоняем без повтора; остальные ошибки возвращают сообщение в очередь.
      channel.nack(message, false, !(error instanceof ImageUploadStateConflictError));
      return;
    }
    // После commit за удаление отвечает FileDeletionJob, сообщение можно подтвердить.
    channel.ack(message);

    // Удаляем объект в фоне. При сбое сохранённую задачу подхватит обработка по расписанию.
    void this.worker.run().catch((error: unknown) => {
      this.logger.error(`File deletion worker failed: ${String(error)}`);
    });
  }
}
