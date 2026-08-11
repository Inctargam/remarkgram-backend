import type { GetAuthPostsPaginatedResponse } from '@app/posts-grpc';
import type { GetAuthorPostsResponseDto } from '../dto/output/get-author-posts/get-author-posts-response.dto.js';

export class GetAuthorPostsResponseMapper {
  static toResponse(source: GetAuthPostsPaginatedResponse): GetAuthorPostsResponseDto {
    return {
      items: source.items.map((post) => ({
        id: post.id,
        authorId: post.authorId,
        description: post.description || null,
        createdAt: post.createdAt,
        images: post.images.map((image) => ({
          fileId: image.fileId,
          position: image.position,
        })),
      })),
      hasMore: source.hasMore,
      nextCursor: source.nextCursor ?? null,
    };
  }
}
