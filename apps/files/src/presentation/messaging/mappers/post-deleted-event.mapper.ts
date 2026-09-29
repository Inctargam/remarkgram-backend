import { type PostDeletedV1Event } from '@app/message-broker';
import {
  FILES_POST_DELETED_EVENT_TYPE,
  type PostDeletedInboxEvent,
} from '../../../application/integration-events/post-deleted.event.js';

export class PostDeletedEventMapper {
  static toInboxEvent(event: PostDeletedV1Event): PostDeletedInboxEvent {
    const fileIds = [...new Set(event.data.fileIds.map((id) => id.trim()))];
    return {
      eventId: event.eventId,
      eventType: FILES_POST_DELETED_EVENT_TYPE,
      payload: {
        postId: event.data.postId,
        userId: event.data.authorId,
        fileIds,
        deletedAt: event.data.deletedAt,
      },
    };
  }
}
