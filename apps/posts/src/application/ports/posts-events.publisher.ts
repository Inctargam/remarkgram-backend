import type { PostDeletedV1Event } from '@app/message-broker';

export abstract class PostsEventsPublisher {
  abstract deletedPostEvent(event: PostDeletedV1Event): Promise<void>;
}
