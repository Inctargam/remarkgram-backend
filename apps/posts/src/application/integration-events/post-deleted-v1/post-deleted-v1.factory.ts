import { POST_DELETED_V1_EVENT_NAME, type PostDeletedV1Event } from '@app/message-broker';
import { randomUUID } from 'node:crypto';

export type CreatePostDeletedV1Params = {
  postId: number;
  authorId: number;
  fileIds: readonly string[];
  deletedAt: Date;
};

export class PostDeletedV1Factory {
  static create(params: CreatePostDeletedV1Params): PostDeletedV1Event {
    return {
      eventId: randomUUID(),
      eventType: POST_DELETED_V1_EVENT_NAME,
      aggregateType: 'post',
      aggregateId: String(params.postId),
      data: {
        postId: params.postId,
        authorId: params.authorId,
        deletedAt: params.deletedAt.toISOString(),
        fileIds: [...params.fileIds],
      },
    };
  }
}
