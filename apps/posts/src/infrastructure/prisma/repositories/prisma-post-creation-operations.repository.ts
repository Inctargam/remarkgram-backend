import { Injectable } from '@nestjs/common';
import { PostIdempotencyKeyConflictError } from '../../../application/errors/create-post.errors.js';
import { PostCreationOperationsRepository } from '../../../application/ports/post-creation-operations.repository.js';
import {
  PostCreationOperationStatus,
  type GetOrCreatePostCreationOperationParams,
  type PostCreationFailureCode,
  type PostCreationOperation,
  type PostCreationOperationContext,
  type TransitionPostCreationOperationParams,
} from '../../../application/types/post-creation-operation.types.js';
import {
  PostCreationOperationStatus as PrismaPostCreationOperationStatus,
  Prisma,
} from '../generated/client.js';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaPostCreationOperationsRepository extends PostCreationOperationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getOrCreate(params: GetOrCreatePostCreationOperationParams): Promise<PostCreationOperation> {
    try {
      const operation = await this.prisma.postCreationOperation.create({
        data: {
          id: params.id,
          userId: params.userId,
          idempotencyKey: params.idempotencyKey,
          description: params.description,
          imageIds: [...params.imageIds],
          reserveOperationId: params.reserveOperationId,
          attachOperationId: params.attachOperationId,
          compensationOperationId: params.compensationOperationId,
        },
      });

      return this.toApplication(operation);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
    }

    // Конкурирующие запросы с одним ключом идемпотентности состязаются только при INSERT.
    // Проигравший использует сохранённую сагу вместе со всеми стабильными ID её шагов.
    const operation = await this.prisma.postCreationOperation.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: params.userId,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });

    if (!operation) {
      // Случайное совпадение ID саги не является повтором того же HTTP-запроса.
      throw new PostIdempotencyKeyConflictError();
    }

    if (!this.hasSamePayload(operation, params)) {
      throw new PostIdempotencyKeyConflictError();
    }

    return this.toApplication(operation);
  }

  async findById(id: string): Promise<PostCreationOperation | null> {
    const operation = await this.prisma.postCreationOperation.findUnique({ where: { id } });
    return operation ? this.toApplication(operation) : null;
  }

  async transition(
    params: TransitionPostCreationOperationParams,
    ctx?: PostCreationOperationContext,
  ): Promise<boolean> {
    const client = this.getClient(ctx);
    const result = await client.postCreationOperation.updateMany({
      where: {
        id: params.id,
        status: this.toPrismaStatus(params.expectedStatus),
        version: params.expectedVersion,
      },
      data: {
        status: this.toPrismaStatus(params.status),
        version: { increment: 1 },
        ...(params.postId === undefined ? {} : { postId: params.postId }),
        ...(params.failureCode === undefined ? {} : { failureCode: params.failureCode }),
      },
    });

    // Нулевое число обновлённых строк означает проигрыш оптимистичной гонки, а не бизнес-ошибку.
    // Оркестратор перечитывает запись и продолжает работу с состоянием, сохранённым победителем.
    return result.count === 1;
  }

  private hasSamePayload(
    operation: Prisma.PostCreationOperationGetPayload<Record<string, never>>,
    params: GetOrCreatePostCreationOperationParams,
  ): boolean {
    return (
      operation.description === params.description &&
      operation.imageIds.length === params.imageIds.length &&
      operation.imageIds.every((imageId, index) => imageId === params.imageIds[index])
    );
  }

  private getClient(ctx?: PostCreationOperationContext): Prisma.TransactionClient | PrismaService {
    return ctx ? (ctx as Prisma.TransactionClient) : this.prisma;
  }

  private toApplication(
    operation: Prisma.PostCreationOperationGetPayload<Record<string, never>>,
  ): PostCreationOperation {
    return {
      id: operation.id,
      userId: operation.userId,
      idempotencyKey: operation.idempotencyKey,
      description: operation.description,
      imageIds: operation.imageIds,
      status: operation.status as PostCreationOperationStatus,
      postId: operation.postId,
      version: operation.version,
      reserveOperationId: operation.reserveOperationId,
      attachOperationId: operation.attachOperationId,
      compensationOperationId: operation.compensationOperationId,
      failureCode: operation.failureCode as PostCreationFailureCode | null,
    };
  }

  private toPrismaStatus(status: PostCreationOperationStatus): PrismaPostCreationOperationStatus {
    return status;
  }
}
