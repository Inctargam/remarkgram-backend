import { POST_DELETED_V1_EVENT_NAME, type JsonObject, type PostDeletedV1Event } from '@app/message-broker';
import type { ApplicationOutboxEvent } from '../../types/outbox.types.js';

export class PostDeletedOutboxEventMapper {
  static toIntegrationEvent(record: ApplicationOutboxEvent): PostDeletedV1Event {
    if (record.eventType !== POST_DELETED_V1_EVENT_NAME) {
      throw new Error(`Unsupported outbox event type: ${record.eventType}`);
    }

    if (record.aggregateType !== 'post') {
      throw new Error(`Invalid aggregate type for ${record.eventType}: ${record.aggregateType}`);
    }

    if (!this.isPayload(record.payload)) {
      throw new Error(`Invalid payload for outbox event ${record.id}`);
    }

    return {
      eventId: record.id,
      eventType: POST_DELETED_V1_EVENT_NAME,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      data: record.payload,
    };
  }

  private static isPayload(value: unknown): value is PostDeletedV1Event['data'] {
    if (!this.isJsonObject(value)) return false;

    return (
      Number.isSafeInteger(value.postId) &&
      Number.isSafeInteger(value.authorId) &&
      typeof value.deletedAt === 'string' &&
      !Number.isNaN(Date.parse(value.deletedAt)) &&
      Array.isArray(value.fileIds) &&
      value.fileIds.every((fileId) => typeof fileId === 'string')
    );
  }

  private static isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
