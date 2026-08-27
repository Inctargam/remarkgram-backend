import type { FindAuthorPostsPageParams, FindAuthorPostsPageResult } from '../types/posts.types.js';

export abstract class PostsQueryRepository {
  abstract findAuthorPostsPage(params: FindAuthorPostsPageParams): Promise<FindAuthorPostsPageResult>;
}
