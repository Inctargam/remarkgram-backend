import { MAX_IMAGES_PER_POST, MAX_POST_DESCRIPTION_LENGTH, MIN_IMAGES_PER_POST } from '@app/posts-grpc';
import { Logger } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { isUUID } from 'class-validator';
import {
  DuplicatePostImageIdError,
  InvalidIdempotencyKeyError,
  InvalidPostDescriptionError,
  InvalidPostImageCountError,
  InvalidUserIdError,
  PostImageAlreadyAttachedError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../errors/create-post.errors.js';
import { PostsErrorCode } from '../../errors/posts.error.js';
import { ImageUploadsGateway } from '../../ports/image-uploads.gateway.js';
import { PostCreationOperationsRepository } from '../../ports/post-creation-operations.repository.js';
import { PostsRepository } from '../../ports/posts.repository.js';
import { UnitOfWork } from '../../ports/unit-of-work.js';
import {
  PostCreationOperationStatus,
  type PostCreationFailureCode,
  type PostCreationOperation,
} from '../../types/post-creation-operation.types.js';
import type { CreatePostResult } from '../../types/posts.types.js';

class PostCreationVersionConflictError extends Error {}

export type CreatePostParams = {
  userId: number;
  idempotencyKey: string;
  description?: string;
  imageIds: readonly string[];
};

export class CreatePostCommand extends Command<CreatePostResult> {
  constructor(public readonly params: CreatePostParams) {
    super();
  }
}

@CommandHandler(CreatePostCommand)
export class CreatePostUseCase implements ICommandHandler<CreatePostCommand> {
  private readonly logger = new Logger(CreatePostUseCase.name);

  constructor(
    private readonly postsRepository: PostsRepository,
    private readonly operationsRepository: PostCreationOperationsRepository,
    private readonly imageUploadsGateway: ImageUploadsGateway,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(command: CreatePostCommand): Promise<CreatePostResult> {
    const { userId, idempotencyKey, description, imageIds } = command.params;
    this.validateInput(command.params);

    const operation = await this.operationsRepository.getOrCreate({
      id: crypto.randomUUID(),
      userId,
      idempotencyKey,
      description: description ?? null,
      imageIds,
      reserveOperationId: crypto.randomUUID(),
      attachOperationId: crypto.randomUUID(),
      compensationOperationId: crypto.randomUUID(),
    });

    return this.resume(operation);
  }

  private async resume(initialOperation: PostCreationOperation): Promise<CreatePostResult> {
    let operation = initialOperation;

    while (true) {
      switch (operation.status) {
        case PostCreationOperationStatus.STARTED:
          operation = await this.reserveImagesAndCreatePost(operation);
          break;

        case PostCreationOperationStatus.POST_CREATED:
          operation = await this.attachImagesAndPublishPost(operation);
          break;

        case PostCreationOperationStatus.COMPENSATION_PENDING:
          operation = await this.releaseReservation(operation);
          break;

        case PostCreationOperationStatus.COMPLETED:
          return { id: this.getPostId(operation) };

        case PostCreationOperationStatus.FAILED:
          this.throwPersistedFailure(operation);
      }
    }
  }

  private async reserveImagesAndCreatePost(operation: PostCreationOperation): Promise<PostCreationOperation> {
    try {
      // Во время gRPC-вызова транзакция БД не удерживается. После тайм-аута шаг повторяется
      // с сохранённым operationId, поэтому Files может вернуть уже зафиксированный результат.
      await this.imageUploadsGateway.reserveImageUploads({
        userId: operation.userId,
        imageIds: operation.imageIds,
        reservationId: operation.id,
        operationId: operation.reserveOperationId,
      });
    } catch (error) {
      const failureCode = this.getReserveFailureCode(error);

      if (failureCode !== null) {
        const transitioned = await this.operationsRepository.transition({
          id: operation.id,
          expectedStatus: PostCreationOperationStatus.STARTED,
          expectedVersion: operation.version,
          status: PostCreationOperationStatus.FAILED,
          failureCode,
        });

        if (transitioned) {
          return {
            ...operation,
            status: PostCreationOperationStatus.FAILED,
            version: operation.version + 1,
            failureCode,
          };
        }
      }

      return this.resumeAfterAmbiguousError(operation, error);
    }

    try {
      const postId = await this.unitOfWork.run(async (ctx) => {
        const createdPostId = await this.postsRepository.create(
          {
            authorId: operation.userId,
            description: operation.description,
            imageIds: operation.imageIds,
          },
          ctx,
        );
        const transitioned = await this.operationsRepository.transition(
          {
            id: operation.id,
            expectedStatus: PostCreationOperationStatus.STARTED,
            expectedVersion: operation.version,
            status: PostCreationOperationStatus.POST_CREATED,
            postId: createdPostId,
          },
          ctx,
        );

        if (!transitioned) {
          // Ошибка откатывает дублирующую вставку Post/PostImage, выполненную конкурентным
          // HTTP-повтором, который проиграл CAS-переход состояния саги.
          throw new PostCreationVersionConflictError();
        }

        return createdPostId;
      });

      return {
        ...operation,
        status: PostCreationOperationStatus.POST_CREATED,
        version: operation.version + 1,
        postId,
      };
    } catch (error) {
      const persistedOperation = await this.inspectAfterError(operation, error);

      if (this.hasAdvanced(operation, persistedOperation)) {
        return persistedOperation;
      }

      if (error instanceof PostImageAlreadyAttachedError) {
        const transitioned = await this.operationsRepository.transition({
          id: operation.id,
          expectedStatus: PostCreationOperationStatus.STARTED,
          expectedVersion: operation.version,
          status: PostCreationOperationStatus.COMPENSATION_PENDING,
          failureCode: PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED,
        });

        if (transitioned) {
          return {
            ...operation,
            status: PostCreationOperationStatus.COMPENSATION_PENDING,
            version: operation.version + 1,
            failureCode: PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED,
          };
        }

        return this.reload(operation.id);
      }

      throw error;
    }
  }

  private async attachImagesAndPublishPost(operation: PostCreationOperation): Promise<PostCreationOperation> {
    const postId = this.getPostId(operation);

    try {
      await this.imageUploadsGateway.attachReservedImageUploads({
        userId: operation.userId,
        reservationId: operation.id,
        operationId: operation.attachOperationId,
      });
    } catch (error) {
      return this.resumeAfterAmbiguousError(operation, error);
    }

    try {
      await this.unitOfWork.run(async (ctx) => {
        // CAS-переход саги и публикация фиксируются вместе. CAS выполняется первым,
        // поэтому проигравший конкурентный повтор не пытается опубликовать пост.
        const transitioned = await this.operationsRepository.transition(
          {
            id: operation.id,
            expectedStatus: PostCreationOperationStatus.POST_CREATED,
            expectedVersion: operation.version,
            status: PostCreationOperationStatus.COMPLETED,
          },
          ctx,
        );

        if (!transitioned) {
          throw new PostCreationVersionConflictError();
        }

        await this.postsRepository.publish(postId, ctx);
      });

      return {
        ...operation,
        status: PostCreationOperationStatus.COMPLETED,
        version: operation.version + 1,
      };
    } catch (error) {
      const persistedOperation = await this.inspectAfterError(operation, error);

      if (this.hasAdvanced(operation, persistedOperation)) {
        return persistedOperation;
      }

      throw error;
    }
  }

  private async releaseReservation(operation: PostCreationOperation): Promise<PostCreationOperation> {
    try {
      // Компенсация является сохраняемым завершающим шагом. Её повтор использует отдельный
      // стабильный operationId и не может заново открыть исходное резервирование.
      await this.imageUploadsGateway.releaseReservedImageUploads({
        userId: operation.userId,
        reservationId: operation.id,
        operationId: operation.compensationOperationId,
      });
    } catch (error) {
      return this.resumeAfterAmbiguousError(operation, error);
    }

    const transitioned = await this.operationsRepository.transition({
      id: operation.id,
      expectedStatus: PostCreationOperationStatus.COMPENSATION_PENDING,
      expectedVersion: operation.version,
      status: PostCreationOperationStatus.FAILED,
    });

    if (!transitioned) {
      return this.reload(operation.id);
    }

    return {
      ...operation,
      status: PostCreationOperationStatus.FAILED,
      version: operation.version + 1,
    };
  }

  private async resumeAfterAmbiguousError(
    operation: PostCreationOperation,
    originalError: unknown,
  ): Promise<PostCreationOperation> {
    const persistedOperation = await this.inspectAfterError(operation, originalError);

    if (this.hasAdvanced(operation, persistedOperation)) {
      return persistedOperation;
    }

    throw originalError;
  }

  private async inspectAfterError(
    operation: PostCreationOperation,
    originalError: unknown,
  ): Promise<PostCreationOperation> {
    try {
      return await this.reload(operation.id);
    } catch (inspectionError) {
      this.logger.error('Failed to inspect post creation operation after an ambiguous error', {
        operationId: operation.id,
        error: inspectionError,
      });
      throw originalError;
    }
  }

  private async reload(id: string): Promise<PostCreationOperation> {
    const operation = await this.operationsRepository.findById(id);

    if (operation === null) {
      throw new Error(`Post creation operation ${id} was not found`);
    }

    return operation;
  }

  private hasAdvanced(previous: PostCreationOperation, current: PostCreationOperation): boolean {
    return current.status !== previous.status || current.version !== previous.version;
  }

  private getReserveFailureCode(error: unknown): PostCreationFailureCode | null {
    if (error instanceof PostImageNotFoundError) {
      return PostsErrorCode.POST_IMAGE_NOT_FOUND;
    }

    if (error instanceof PostImagesNotAvailableError) {
      return PostsErrorCode.POST_IMAGES_NOT_AVAILABLE;
    }

    return null;
  }

  private throwPersistedFailure(operation: PostCreationOperation): never {
    switch (operation.failureCode) {
      case PostsErrorCode.POST_IMAGE_NOT_FOUND:
        throw new PostImageNotFoundError();
      case PostsErrorCode.POST_IMAGES_NOT_AVAILABLE:
        throw new PostImagesNotAvailableError();
      case PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED:
        throw new PostImageAlreadyAttachedError();
      default:
        throw new Error(`Post creation operation ${operation.id} has no valid failure code`);
    }
  }

  private getPostId(operation: PostCreationOperation): number {
    if (operation.postId === null) {
      throw new Error(`Post creation operation ${operation.id} has no post ID`);
    }

    return operation.postId;
  }

  private validateInput(params: CreatePostParams): void {
    if (!Number.isSafeInteger(params.userId) || params.userId <= 0) {
      throw new InvalidUserIdError();
    }

    if (!isUUID(params.idempotencyKey, '4')) {
      throw new InvalidIdempotencyKeyError();
    }

    if (params.description !== undefined && params.description.length > MAX_POST_DESCRIPTION_LENGTH) {
      throw new InvalidPostDescriptionError();
    }

    if (params.imageIds.length < MIN_IMAGES_PER_POST || params.imageIds.length > MAX_IMAGES_PER_POST) {
      throw new InvalidPostImageCountError();
    }

    if (new Set(params.imageIds).size !== params.imageIds.length) {
      throw new DuplicatePostImageIdError();
    }
  }
}
