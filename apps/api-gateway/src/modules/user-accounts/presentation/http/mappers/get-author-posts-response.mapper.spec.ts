import { describe, expect, it } from 'vitest';
import { GetAuthorPostsResponseMapper } from './get-author-posts-response.mapper.js';

describe('GetAuthorPostsResponseMapper', () => {
  it('maps the gRPC page to the public HTTP response', () => {
    const response = GetAuthorPostsResponseMapper.toResponse(
      {
        items: [
          {
            id: '42',
            authorId: '7',
            description: undefined,
            createdAt: '2026-08-11T11:00:00.000Z',
            images: [
              {
                fileId: '550e8400-e29b-41d4-a716-446655440000',
                position: 0,
              },
            ],
          },
        ],
        hasMore: false,
        nextCursor: undefined,
      },
      'https://api.remark-gram.com/api/v1/',
    );

    expect(response).toEqual({
      items: [
        {
          id: 42,
          authorId: 7,
          description: null,
          createdAt: '2026-08-11T11:00:00.000Z',
          images: [
            {
              fileId: '550e8400-e29b-41d4-a716-446655440000',
              position: 0,
              url: 'https://api.remark-gram.com/api/v1/files/images/550e8400-e29b-41d4-a716-446655440000',
            },
          ],
        },
      ],
      hasMore: false,
      nextCursor: null,
    });
  });
});
