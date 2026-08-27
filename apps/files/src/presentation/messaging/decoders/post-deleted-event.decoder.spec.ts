import { POST_DELETED_V1_EVENT_NAME } from '@app/message-broker';
import { PostDeletedEventDecoder } from './post-deleted-event.decoder.js';

describe('PostDeletedEventDecoder', () => {
  const event = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: POST_DELETED_V1_EVENT_NAME,
    aggregateType: 'post',
    aggregateId: '42',
    data: {
      postId: 42,
      authorId: 7,
      fileIds: ['22222222-2222-4222-8222-222222222222'],
      deletedAt: '2026-08-21T12:00:00.000Z',
    },
  };

  it('accepts a valid post-deleted event', () => {
    expect(PostDeletedEventDecoder.decode(event)).toEqual({ success: true, value: event });
  });

  it('rejects a non-UUID event id', () => {
    expect(PostDeletedEventDecoder.decode({ ...event, eventId: 'invalid' })).toEqual({
      success: false,
      error: 'Invalid eventId',
    });
  });

  it('rejects non-UUID file ids before they reach PostgreSQL', () => {
    expect(
      PostDeletedEventDecoder.decode({
        ...event,
        data: { ...event.data, fileIds: ['not-a-uuid'] },
      }),
    ).toEqual({
      success: false,
      error: 'fileIds must be a non-empty array of UUID v4 strings',
    });
  });

  it('rejects an aggregate id that does not match the deleted post', () => {
    expect(PostDeletedEventDecoder.decode({ ...event, aggregateId: '41' })).toEqual({
      success: false,
      error: 'aggregateId must match data.postId',
    });
  });

  it('rejects non-positive domain identifiers', () => {
    expect(
      PostDeletedEventDecoder.decode({
        ...event,
        aggregateId: '0',
        data: { ...event.data, postId: 0 },
      }),
    ).toEqual({ success: false, error: 'Invalid postId' });
  });

  it('rejects a non-ISO deletion timestamp', () => {
    expect(
      PostDeletedEventDecoder.decode({
        ...event,
        data: { ...event.data, deletedAt: 'August 21, 2026' },
      }),
    ).toEqual({ success: false, error: 'Invalid deletedAt' });
  });
});
