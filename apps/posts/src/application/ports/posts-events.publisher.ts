import type { PostDeletedV1Event } from '@app/message-broker';

export abstract class PostsEventsPublisher {
  abstract publishPostDeleted(event: PostDeletedV1Event): Promise<void>;
}
