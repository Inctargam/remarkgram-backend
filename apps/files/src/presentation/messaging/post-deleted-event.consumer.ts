import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { POST_DELETED_V1_EVENT_NAME } from '@app/message-broker';
import { InboxEventsRepository } from '../../application/ports/inbox-events.repository.js';
import { PostDeletedEventMapper } from './mappers/post-deleted-event.mapper.js';
import { PostDeletedInboxWorker } from '../../application/workers/post-deleted-inbox.worker.js';
import { PostDeletedEventDecoder } from './decoders/post-deleted-event.decoder.js';
import { InboxEventIdCollisionError } from '../../application/errors/inbox-event-id-collision.error.js';

@Controller()
export class PostDeletedEventConsumer {
  private readonly logger = new Logger(PostDeletedEventConsumer.name);

  constructor(
    private readonly inbox: InboxEventsRepository,
    private postDeletedInboxWorker: PostDeletedInboxWorker,
  ) {}
  @EventPattern(POST_DELETED_V1_EVENT_NAME)
  async handle(@Payload() data: unknown, @Ctx() context: RmqContext) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const channel = context.getChannelRef();
    const message = context.getMessage();

    /**
     *  В случае не валидного события, обработчик будет прерван
     *  Событие не будет добавляться в таблицу
     * */
    const decoded = PostDeletedEventDecoder.decode(data);
    if (!decoded.success) {
      this.logger.warn(`Rejected post-deleted message: reason="${decoded.error}"`);
      // false означает не отправлять повторно сообщение в очередь.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      channel.nack(message, false, false);
      return;
    }
    try {
      const event = PostDeletedEventMapper.toInboxEvent(decoded.value);
      if (event.payload.fileIds.length !== decoded.value.data.fileIds.length) {
        this.logger.warn(
          `Normalized duplicate file IDs in post-deleted event: eventId=${event.eventId} postId=${event.payload.postId}`,
        );
      }

      const result = await this.inbox.add({
        eventId: event.eventId,
        eventType: event.eventType,
        payload: event.payload,
      });

      this.logger.debug(
        result.created
          ? `Persisted post-deleted inbox event: eventId=${event.eventId} postId=${event.payload.postId} fileCount=${event.payload.fileIds.length}`
          : `Acknowledged duplicate post-deleted event: eventId=${event.eventId}`,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      channel.ack(message);

      /**
       * После сохранения события и подтверждения сообщения сразу инициируем обработку inbox.
       * Consumer не ожидает завершения worker: обработка продолжается асинхронно в том же
       * процессе. Такой событийный запуск позволяет не опрашивать БД частой cron-задачей,
       * которая могла бы без новой работы регулярно пробуждать compute Neon.
       */
      void this.postDeletedInboxWorker.run().catch((error: unknown) => {
        this.logger.error(
          `Failed to process inbox events: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to persist post-deleted inbox event: eventId=${decoded.value.eventId} reason="${errorMessage}"`,
        error instanceof Error ? error.stack : undefined,
      );

      // Коллизия eventId не исправится повторной доставкой, остальные ошибки
      // считаются временными и возвращают сообщение в очередь.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      channel.nack(message, false, !(error instanceof InboxEventIdCollisionError));
    }
  }
}
