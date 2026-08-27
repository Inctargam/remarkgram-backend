import { POST_DELETED_V1_EVENT_NAME } from '@app/message-broker';
import { describe, expect, it } from 'vitest';
import { PostDeletedV1Factory } from './post-deleted-v1.factory.js';

describe('PostDeletedV1Factory', () => {
  it('creates a self-contained versioned deletion event', () => {
    const fileIds = ['image-1', 'image-2'];

    const event = PostDeletedV1Factory.create({
      postId: 42,
      authorId: 7,
      deletedAt: new Date('2026-08-19T12:34:56.789Z'),
      fileIds,
    });
    fileIds.push('added-after-creation');

    expect(event).toEqual({
      eventId: event.eventId,
      eventType: POST_DELETED_V1_EVENT_NAME,
      aggregateType: 'post',
      aggregateId: '42',
      data: {
        postId: 42,
        authorId: 7,
        deletedAt: '2026-08-19T12:34:56.789Z',
        fileIds: ['image-1', 'image-2'],
      },
    });
    expect(event.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
