import type { TransactionContext } from '../ports/unit-of-work.js';
import type { PostsErrorCode } from '../errors/posts.error.js';

export enum PostCreationOperationStatus {
  STARTED = 'STARTED',
  POST_CREATED = 'POST_CREATED',
  COMPENSATION_PENDING = 'COMPENSATION_PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export type PostCreationFailureCode =
  | PostsErrorCode.POST_IMAGE_NOT_FOUND
  | PostsErrorCode.POST_IMAGES_NOT_AVAILABLE
  | PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED;

export type PostCreationOperation = {
  id: string;
  userId: number;
  idempotencyKey: string;
  description: string | null;
  imageIds: readonly string[];
  status: PostCreationOperationStatus;
  postId: number | null;
  // Версия оптимистичной блокировки, используемая вместе со status в PostgreSQL CAS.
  // Это не аренда и не маркер ограждения (fencing token): значение не имеет срока действия.
  version: number;
  // У каждого удалённого шага есть стабильный идентификатор. Поэтому после потери gRPC-ответа
  // Files распознает повтор как ту же операцию, а не как новую команду.
  reserveOperationId: string;
  attachOperationId: string;
  compensationOperationId: string;
  failureCode: PostCreationFailureCode | null;
};

export type GetOrCreatePostCreationOperationParams = {
  id: string;
  userId: number;
  idempotencyKey: string;
  description: string | null;
  imageIds: readonly string[];
  reserveOperationId: string;
  attachOperationId: string;
  compensationOperationId: string;
};

export type TransitionPostCreationOperationParams = {
  id: string;
  expectedStatus: PostCreationOperationStatus;
  expectedVersion: number;
  status: PostCreationOperationStatus;
  postId?: number;
  failureCode?: PostCreationFailureCode;
};

export type PostCreationOperationContext = TransactionContext;
