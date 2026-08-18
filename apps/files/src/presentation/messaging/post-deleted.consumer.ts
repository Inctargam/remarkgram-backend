import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { POST_DELETED_V1_EVENT_NAME, type PostDeletedV1Event } from '@app/message-broker';
import { InboxEventsRepository } from '../../application/ports/inbox-events.repository.js';
import { PostDeletedEventMapper } from './mappers/post-deleted-event.mapper.js';

@Controller()
export class PostDeletedConsumer {
  private readonly logger = new Logger(PostDeletedConsumer.name);
  constructor(private readonly inbox: InboxEventsRepository) {}
  @EventPattern(POST_DELETED_V1_EVENT_NAME)
  async handle(@Payload() data: PostDeletedV1Event, @Ctx() context: RmqContext) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const channel = context.getChannelRef();
    const message = context.getMessage();

    try {
      try {
        const event = PostDeletedEventMapper.toInboxEvent(data);
        this.logger.log(event);
        await this.inbox.add({
          eventId: event.eventId,
          eventType: event.eventType,
          payload: event.payload,
        });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
        channel.ack(message);
      } catch (mapError) {
        const errorMessage = mapError instanceof Error ? mapError.message : String(mapError);
        this.logger.error(`Failed to mapping to inbox event ${data.eventId}: ${errorMessage}`);

        // false означает не отправлять повторно сообщение в очередь.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
        channel.nack(message, false, false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to persist inbox event ${data.eventId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // true означает повторно положить сообщение в очередь.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      channel.nack(message, false, true);
    }
  }
}
