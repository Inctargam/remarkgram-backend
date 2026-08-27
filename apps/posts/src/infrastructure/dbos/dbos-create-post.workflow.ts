import { ConfiguredInstance, DBOS } from '@dbos-inc/dbos-sdk';
import { Injectable } from '@nestjs/common';
import {
  PostIdempotencyKeyConflictError,
  PostImageAlreadyAttachedError,
} from '../../application/errors/create-post.errors.js';
import { PostsErrorCode } from '../../application/errors/posts.error.js';
import { CreatePostWorkflow } from '../../application/ports/create-post.workflow.js';
import { ImageUploadsGateway } from '../../application/ports/image-uploads.gateway.js';
import type {
  CreatePostResult,
  CreatePostWorkflowParams,
  ReleaseReservedImageUploadsParams,
} from '../../application/types/posts.types.js';
import { Prisma } from '../prisma/generated/client.js';
import { getDbosPostsErrorCode, restoreDbosPostsError } from './dbos-posts-error.mapper.js';
import { PostsDbosDataSource } from './posts-dbos.datasource.js';

type WorkflowInput = Omit<CreatePostWorkflowParams, 'workflowId'>;

@Injectable()
export class DbosCreatePostWorkflow extends ConfiguredInstance implements CreatePostWorkflow {
  constructor(
    private readonly dataSource: PostsDbosDataSource,
    private readonly imageUploadsGateway: ImageUploadsGateway,
  ) {
    // Стабильное имя позволяет DBOS найти NestJS-инстанс с его зависимостями
    // при восстановлении workflow после перезапуска процесса.
    super('create-post-workflow');
  }

  async execute(params: CreatePostWorkflowParams): Promise<CreatePostResult> {
    const { workflowId, ...input } = params;

    try {
      // Повтор с тем же workflowID получает handle уже существующего workflow.
      const handle = await DBOS.startWorkflow(this, { workflowID: workflowId }).createPost(input);

      // DBOS атомарно сохраняет input первого запуска. При конкурентном повторе
      // handle указывает на тот же workflow, поэтому сравниваем новый requestHash
      // с хешем фактически принятого DBOS запроса.
      const status = await handle.getStatus();
      if (status?.input === undefined) {
        throw new Error(`Workflow ${workflowId} has no stored input`);
      }

      const [storedInput] = status.input as [WorkflowInput];
      if (storedInput.requestHash !== input.requestHash) {
        throw new PostIdempotencyKeyConflictError();
      }

      return await handle.getResult();
    } catch (error) {
      throw restoreDbosPostsError(error);
    }
  }

  // Порядок durable-операций является частью истории createPostV1. При изменении
  // последовательности нужно регистрировать новую версию workflow.
  @DBOS.workflow({ name: 'createPostV1', maxRecoveryAttempts: 100 })
  async createPost(input: WorkflowInput): Promise<CreatePostResult> {
    // Значение детерминировано DBOS: recovery снова получит тот же reservationId.
    const reservationId = await DBOS.randomUUID();

    await this.reserveImages(input, reservationId);

    let postId: number;
    try {
      postId = await this.createUnpublishedPost(input);
    } catch (error) {
      if (getDbosPostsErrorCode(error) === PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED) {
        await this.releaseReservation({ userId: input.userId, reservationId });
      }

      throw error;
    }

    try {
      await this.attachImages(input.userId, reservationId);
    } catch (error) {
      const errorCode = getDbosPostsErrorCode(error);

      if (
        errorCode === PostsErrorCode.POST_IMAGE_NOT_FOUND ||
        errorCode === PostsErrorCode.POST_IMAGES_NOT_AVAILABLE
      ) {
        await this.releaseReservation({ userId: input.userId, reservationId });
        await this.deleteUnpublishedPost(postId);
      }

      throw error;
    }

    await this.publishPost(postId);
    return { id: postId };
  }

  @DBOS.step()
  private async reserveImages(input: WorkflowInput, reservationId: string): Promise<void> {
    await this.imageUploadsGateway.reserveImageUploads({
      userId: input.userId,
      imageIds: input.imageIds,
      reservationId,
    });
  }

  @DBOS.step()
  private async attachImages(userId: number, reservationId: string): Promise<void> {
    await this.imageUploadsGateway.attachReservedImageUploads({ userId, reservationId });
  }

  @DBOS.step()
  private async releaseReservation(params: ReleaseReservedImageUploadsParams): Promise<void> {
    // Release тоже checkpointed. Если процесс упадёт после успеха Files, но до
    // checkpoint DBOS, recovery безопасно повторит вызов с тем же reservationId.
    await this.imageUploadsGateway.releaseReservedImageUploads(params);
  }

  private async createUnpublishedPost(input: WorkflowInput): Promise<number> {
    // Изменение Posts и checkpoint DBOS фиксируются одной PostgreSQL-транзакцией.
    // Поэтому после commit recovery не создаст второй Post.
    return this.dataSource.runTransaction(
      async () => {
        try {
          const post = await this.dataSource.client.post.create({
            data: {
              authorId: input.userId,
              description: input.description,
              publishedAt: null,
              images: {
                create: input.imageIds.map((fileId, position) => ({ fileId, position })),
              },
            },
            select: { id: true },
          });

          return post.id;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new PostImageAlreadyAttachedError();
          }

          throw error;
        }
      },
      { name: 'createUnpublishedPost' },
    );
  }

  private async publishPost(postId: number): Promise<void> {
    await this.dataSource.runTransaction(
      async () => {
        const result = await this.dataSource.client.post.updateMany({
          where: { id: postId, deletedAt: null, publishedAt: null },
          data: { publishedAt: new Date() },
        });

        if (result.count !== 1) {
          throw new Error(`Unpublished post ${postId} cannot be published`);
        }
      },
      { name: 'publishPost' },
    );
  }

  private async deleteUnpublishedPost(postId: number): Promise<void> {
    await this.dataSource.runTransaction(
      async () => {
        const result = await this.dataSource.client.post.deleteMany({
          where: { id: postId, publishedAt: null },
        });

        if (result.count !== 1) {
          throw new Error(`Unpublished post ${postId} cannot be compensated`);
        }
      },
      { name: 'deleteUnpublishedPost' },
    );
  }
}
