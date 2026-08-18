import { POST_DELETED_V1_EVENT_NAME, type PostDeletedV1Event } from '@app/message-broker';
import {
  FILES_POST_DELETED_EVENT_TYPE,
  type PostDeletedInboxEvent,
} from '../../../application/integration-events/post-deleted.event.js';

export class PostDeletedEventMapper {
  static toInboxEvent(event: PostDeletedV1Event): PostDeletedInboxEvent {
    const fileIds = [...new Set(event.data.fileIds.map((id) => id.trim()))];
    if (![POST_DELETED_V1_EVENT_NAME].includes(event.eventType)) {
      throw new Error(`Unexpected event type: ${event.eventType}`);
    }
    if (fileIds.length === 0) {
      throw new Error('Post-deleted event has no valid file IDs');
    }
    if (!Number.isSafeInteger(event.data.authorId)) {
      throw new Error('Invalid authorId');
    }

    if (Number.isNaN(Date.parse(event.data.deletedAt))) {
      throw new Error('Invalid deletedAt');
    }

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
