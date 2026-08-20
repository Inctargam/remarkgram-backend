import { POST_DELETED_V1_EVENT_NAME, type PostDeletedV1Event } from '@app/message-broker';

export type DecodeResult<T> = { success: true; value: T } | { success: false; error: string };

export class PostDeletedEventDecoder {
  static decode(value: unknown): DecodeResult<PostDeletedV1Event> {
    if (!this.isRecord(value)) {
      return this.failure('Event must be an object');
    }

    if (typeof value.eventId !== 'string' || value.eventId.length === 0) {
      return this.failure('Invalid eventId');
    }

    if (value.eventType !== POST_DELETED_V1_EVENT_NAME) {
      return this.failure(`Unexpected event type: ${String(value.eventType)}`);
    }

    if (value.aggregateType !== 'post') {
      return this.failure(`Unexpected aggregate type: ${String(value.aggregateType)}`);
    }

    if (typeof value.aggregateId !== 'string' || value.aggregateId.length === 0) {
      return this.failure('Invalid aggregateId');
    }

    if (!this.isRecord(value.data)) {
      return this.failure('Event data must be an object');
    }

    const { data } = value;

    if (typeof data.postId !== 'number' || !Number.isSafeInteger(data.postId)) {
      return this.failure('Invalid postId');
    }

    if (typeof data.authorId !== 'number' || !Number.isSafeInteger(data.authorId)) {
      return this.failure('Invalid authorId');
    }

    if (!this.isNonEmptyStringArray(data.fileIds)) {
      return this.failure('fileIds must be a non-empty array of non-empty strings');
    }

    if (
      typeof data.deletedAt !== 'string' ||
      data.deletedAt.length === 0 ||
      Number.isNaN(Date.parse(data.deletedAt))
    ) {
      return this.failure('Invalid deletedAt');
    }

    return {
      success: true,
      value: {
        eventId: value.eventId,
        eventType: POST_DELETED_V1_EVENT_NAME,
        aggregateType: value.aggregateType,
        aggregateId: value.aggregateId,
        data: {
          postId: data.postId,
          authorId: data.authorId,
          fileIds: data.fileIds,
          deletedAt: data.deletedAt,
        },
      },
    };
  }

  private static failure(error: string): DecodeResult<never> {
    return { success: false, error };
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static isNonEmptyStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item): item is string => typeof item === 'string' && item.trim().length > 0)
    );
  }
}
