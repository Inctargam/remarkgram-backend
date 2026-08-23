import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { PostsQueryRepository } from '../../ports/posts-query.repository.js';
import { Logger } from '@nestjs/common';
import { isValidNumericEntityId } from '@app/validation';
import { InvalidUserIdError } from '../../errors/create-post.errors.js';
import type { AuthorPostsCursor } from '../../types/posts.types.js';
import type { PostViewMapper } from '../../../infrastructure/prisma/mappers/post-view.mapper.js';
import { InvalidPostsCursorError, InvalidPostsPageLimitError } from '../../errors/post-pagination.errors.js';
import {
  DEFAULT_POSTS_PAGE_SIZE,
  MAX_POSTS_PAGE_SIZE,
  MIN_POSTS_PAGE_SIZE,
} from '@app/posts-grpc';

type SerializedCursorPayload = {
  id: number;
  createdAt: string;
};

type GetAuthorPostsQueryParams = {
  authorId: number;
  limit?: number;
  cursor?: string;
};
type GetAuthorPostsQueryResult = {
  items: PostViewMapper[];
  hasMore: boolean;
  nextCursor?: string;
};
export class GetAuthorPostsQuery extends Query<GetAuthorPostsQueryResult> {
  constructor(public params: GetAuthorPostsQueryParams) {
    super();
  }
}

@QueryHandler(GetAuthorPostsQuery)
export class GetAuthorPostsQueryHandler implements IQueryHandler<GetAuthorPostsQuery> {
  readonly logger = new Logger(GetAuthorPostsQueryHandler.name);
  constructor(private readonly postsQueryRepository: PostsQueryRepository) {}

  async execute(query: GetAuthorPostsQuery): Promise<GetAuthorPostsQueryResult> {
    const { authorId, limit = DEFAULT_POSTS_PAGE_SIZE, cursor = null } = query.params;
    if (!isValidNumericEntityId(authorId)) {
      throw new InvalidUserIdError();
    }
    if (!this.isValidLimit(limit)) {
      throw new InvalidPostsPageLimitError();
    }

    const cursorEncode = this.normalizeCursor(cursor);

    // TODO: При доработке UC-4 исключить из выдачи посты, у которых publishedAt равен null.
    const postsPageResult = await this.postsQueryRepository.findAuthorPostsPage({
      authorId,
      limit,
      cursor: cursorEncode,
    });
    return {
      items: postsPageResult.items,
      hasMore: postsPageResult.hasMore,
      nextCursor: postsPageResult.nextCursor ? this.encodeCursor(postsPageResult.nextCursor) : undefined,
    };
  }

  private isValidLimit(limit: number): boolean {
    return limit >= MIN_POSTS_PAGE_SIZE && limit <= MAX_POSTS_PAGE_SIZE && Number.isInteger(limit);
  }

  private normalizeCursor(cursor: string | null): AuthorPostsCursor | null {
    if (!cursor) {
      return null;
    }
    return this.decodeCursor(cursor);
  }

  private decodeCursor(cursor: string): AuthorPostsCursor {
    let decodedCursor: unknown;
    try {
      decodedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    } catch (e) {
      this.logger.error(`Failed to decode cursor: ${e}`);
      throw new InvalidPostsCursorError();
    }
    if (!this.isSerializedCursorPayload(decodedCursor)) {
      throw new InvalidPostsCursorError();
    }

    const createdAt = new Date(decodedCursor.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new InvalidPostsCursorError();
    }

    return {
      id: decodedCursor.id,
      createdAt,
    };
  }

  private encodeCursor(cursor: AuthorPostsCursor): string {
    const cursorPayload = JSON.stringify(cursor);
    return Buffer.from(cursorPayload).toString('base64');
  }

  private isSerializedCursorPayload(value: unknown): value is SerializedCursorPayload {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const payload = value as Record<string, unknown>;
    return (
      Number.isInteger(payload.id) && (payload.id as number) > 0 && typeof payload.createdAt === 'string'
    );
  }
}
