import { POST_DELETED_V1_EVENT_NAME } from '@app/message-broker';
import { describe, expect, it } from 'vitest';
import { OutboxStatus } from '../../../domain/enums/outbox-event-status.enum.js';
import type { ApplicationOutboxEvent } from '../../types/outbox.types.js';
import { PostDeletedOutboxEventMapper } from './post-deleted-outbox-event.mapper.js';

const validRecord: ApplicationOutboxEvent = {
  id: '7d891c3c-efb6-4bda-a576-d6bcc2d28e78',
  eventType: POST_DELETED_V1_EVENT_NAME,
  aggregateType: 'post',
  aggregateId: '42',
  payload: {
    postId: 42,
    authorId: 7,
    deletedAt: '2026-08-19T00:00:00.000Z',
    fileIds: ['image-1', 'image-2'],
  },
  status: OutboxStatus.PENDING,
  attempts: 0,
  availableAt: new Date('2026-08-19T00:00:00.000Z'),
  createdAt: new Date('2026-08-19T00:00:00.000Z'),
  publishedAt: null,
  lastError: null,
};

describe('PostDeletedOutboxEventMapper', () => {
  it('maps a valid outbox record to the public integration event contract', () => {
    expect(PostDeletedOutboxEventMapper.toIntegrationEvent(validRecord)).toEqual({
      eventId: validRecord.id,
      eventType: POST_DELETED_V1_EVENT_NAME,
      aggregateType: 'post',
      aggregateId: '42',
      data: validRecord.payload,
    });
  });

  it.each([
    ['event type', { eventType: 'post.changed.v1' }],
    ['aggregate type', { aggregateType: 'comment' }],
    ['null payload', { payload: null }],
    ['non-integer post id', { payload: { ...(validRecord.payload as object), postId: 1.5 } }],
    ['invalid deletion date', { payload: { ...(validRecord.payload as object), deletedAt: 'never' } }],
    ['non-string file id', { payload: { ...(validRecord.payload as object), fileIds: ['ok', 2] } }],
  ])('rejects an invalid %s', (_case, overrides) => {
    expect(() => PostDeletedOutboxEventMapper.toIntegrationEvent({ ...validRecord, ...overrides })).toThrow();
  });
});
