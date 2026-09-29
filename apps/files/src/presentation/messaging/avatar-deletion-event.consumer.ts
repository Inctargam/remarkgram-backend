import type { Channel, ConsumeMessage } from 'amqplib';
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

type AvatarDeletionMessage = Pick<AvatarDeletionRequestedV1Event, 'eventId' | 'eventType' | 'data'>;

// Проверяем используемые поля; принимаем также старые сообщения без aggregate metadata.
function isAvatarDeletionEvent(value: unknown): value is AvatarDeletionMessage {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<AvatarDeletionMessage>;
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
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as ConsumeMessage;

    if (!isAvatarDeletionEvent(data)) {
      this.logger.warn('Rejected invalid avatar deletion message');
      channel.reject(message, false);
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
      // В RabbitMQ 4.3 reject увеличивает delivery-count; nack с requeue этого не делает.
      // Аргументы quorum-очереди задают задержку, лимит повторов и перенос в DLQ.
      channel.reject(message, !(error instanceof ImageUploadStateConflictError));
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
