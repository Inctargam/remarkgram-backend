import type { PostViewMapper } from '../../infrastructure/prisma/mappers/post-view.mapper.js';

export type CreatePostResult = {
  id: number;
};

export type CreatePostRepositoryParams = {
  authorId: number;
  description: string | null;
  imageIds: readonly string[];
};

export type ReserveImageUploadsParams = {
  userId: number;
  imageIds: readonly string[];
  reservationId: string;
  operationId: string;
};

export type AttachReservedImageUploadsParams = {
  userId: number;
  reservationId: string;
  operationId: string;
};

export type ReleaseReservedImageUploadsParams = {
  userId: number;
  reservationId: string;
  operationId: string;
};

export type AuthorPostsCursor = {
  id: number;
  createdAt: Date;
};

export type FindAuthorPostsPageParams = {
  authorId: number;
  limit: number;
  cursor: AuthorPostsCursor | null;
};

export type FindAuthorPostsPageResult = {
  items: PostViewMapper[];
  hasMore: boolean;
  nextCursor: AuthorPostsCursor | null;
};
export interface UpdateAuthorPostRepositoryParams {
  id: number;
  authorId: number;
  expectedVersion: number;
  fields: {
    description: string;
  };
}
