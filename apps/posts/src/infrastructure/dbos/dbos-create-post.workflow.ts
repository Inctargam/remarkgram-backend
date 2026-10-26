import { ConfiguredInstance, DBOS, type StepConfig } from '@dbos-inc/dbos-sdk';
import { Injectable } from '@nestjs/common';
import {
  FilesServiceUnavailableError,
  PostIdempotencyKeyConflictError,
  PostImageAlreadyAttachedError,
} from '../../application/errors/create-post.errors.js';
import { PostsError, PostsErrorCode } from '../../application/errors/posts.error.js';
import { CreatePostWorkflow } from '../../application/ports/create-post.workflow.js';
import { FilesGateway } from '../../application/ports/files.gateway.js';
import type {
  CreatePostResult,
  CreatePostWorkflowParams,
  PostImageAttachmentParams,
} from '../../application/types/posts.types.js';
import { Prisma } from '../prisma/generated/client.js';
import { getPostsErrorCode, restorePostsError } from './dbos-posts-error.mapper.js';
import { PostsDbosDataSource } from './posts-dbos.datasource.js';

const filesStepRetryOptions = {
  retriesAllowed: true,
  maxAttempts: 3,
  intervalSeconds: 1,
  backoffRate: 2,
  shouldRetry: (error: unknown) =>
    getPostsErrorCode(error) === PostsErrorCode.IMAGE_UPLOADS_SERVICE_UNAVAILABLE,
} satisfies StepConfig;

type WorkflowInput = {
  requestHash: string;
  userId: number;
  description: string | null;
  fileIds: readonly string[];
};

@Injectable()
export class DbosCreatePostWorkflow extends ConfiguredInstance implements CreatePostWorkflow {
  constructor(
    private readonly dataSource: PostsDbosDataSource,
    private readonly filesGateway: FilesGateway,
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
    } catch (cause) {
      const error = restorePostsError(cause);
      if (!(error instanceof PostsError) || error instanceof FilesServiceUnavailableError) {
        DBOS.logger.error(`CreatePost failed; workflowId=${workflowId}: ${String(cause)}`);
      }
      throw error;
    }
  }

  // Порядок durable-операций является частью истории createPostV2. При изменении
  // последовательности нужно регистрировать новую версию workflow.
  @DBOS.workflow({ name: 'createPostV2', maxRecoveryAttempts: 100 })
  async createPost(input: WorkflowInput): Promise<CreatePostResult> {
    // Recovery и повторы шагов используют один идентификатор операции Files.
    const operationId = await DBOS.randomUUID();
    const postId = await this.createUnpublishedPost(input);
    const attachment = { userId: input.userId, fileIds: input.fileIds, operationId };

    try {
      await this.attachImages(attachment);
    } catch (error) {
      const code = getPostsErrorCode(error);
      if (code === PostsErrorCode.POST_IMAGE_NOT_FOUND || code === PostsErrorCode.POST_IMAGES_NOT_AVAILABLE) {
        // Сначала запрещаем поздний Attach, затем освобождаем связи скрытого поста.
        await this.cancelAttachment(attachment);
        await this.deleteUnpublishedPost(postId);
      }
      throw error;
    }

    await this.publishPost(postId);
    return { id: postId };
  }

  @DBOS.step(filesStepRetryOptions)
  private async attachImages(params: PostImageAttachmentParams): Promise<void> {
    await this.filesGateway.attachPostImages(params);
  }

  @DBOS.step(filesStepRetryOptions)
  private async cancelAttachment(params: PostImageAttachmentParams): Promise<void> {
    await this.filesGateway.cancelPostImageAttachment(params);
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
                create: input.fileIds.map((fileId, position) => ({ fileId, position })),
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
