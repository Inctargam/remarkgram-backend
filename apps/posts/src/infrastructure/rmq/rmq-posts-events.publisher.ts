import { POST_DELETED_V1_EVENT_NAME, type PostDeletedV1Event } from '@app/message-broker';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { PostsEventsPublisher } from '../../application/ports/posts-events.publisher.js';
import { POSTS_EVENTS_RMQ_CLIENT } from './rmq.constants.js';

@Injectable()
export class RmqPostsEventsPublisher implements OnModuleInit, PostsEventsPublisher {
  private readonly logger = new Logger(RmqPostsEventsPublisher.name);

  constructor(
    @Inject(POSTS_EVENTS_RMQ_CLIENT)
    private readonly client: ClientProxy,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async deletedPostEvent(event: PostDeletedV1Event): Promise<void> {
    this.logger.debug(
      `Sending post-deleted integration event: eventId=${event.eventId} postId=${event.data.postId}`,
    );

    await lastValueFrom(this.client.emit(POST_DELETED_V1_EVENT_NAME, event), {
      defaultValue: undefined,
    });
  }
}
