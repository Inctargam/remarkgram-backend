import type { GetAuthPostsPaginatedResponse } from '@app/posts-grpc';
import type { GetAuthorPostsDto } from '../dto/output/get-author-posts/get-author-posts.dto.js';

export class GetAuthorPostsResponseMapper {
  static toResponse(source: GetAuthPostsPaginatedResponse, backendApiUrl: string): GetAuthorPostsDto {
    return {
      items: source.items.map((post) => ({
        id: Number(post.id),
        authorId: Number(post.authorId),
        description: post?.description ?? null,
        createdAt: post.createdAt,
        images: post.images.map((image) => ({
          fileId: image.fileId,
          position: image.position,
          url: new URL(`files/images/${encodeURIComponent(image.fileId)}`, backendApiUrl).toString(),
        })),
      })),
      hasMore: source.hasMore,
      nextCursor: source.nextCursor ?? null,
    };
  }
}
