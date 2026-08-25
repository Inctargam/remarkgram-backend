import { Injectable } from '@nestjs/common';
import { PostImageAlreadyAttachedError } from '../../../application/errors/create-post.errors.js';
import { PostsRepository } from '../../../application/ports/posts.repository.js';
import type { Post } from '../../../domain/entities/post.entity.js';
import {
  CreatePostRepositoryParams,
  SoftDeletePostRepositoryParams,
  SoftDeletePostResult,
  UpdateAuthorPostRepositoryParams,
} from '../../../application/types/posts.types.js';
import { Prisma } from '../generated/client.js';
import { PrismaService } from '../prisma.service.js';
import { PostUpdateConflictError } from '../../../application/errors/update-post.errors.js';
import { PostPrismaMapper } from '../mappers/post-prisma.mapper.js';
import { TransactionContext } from '../../../application/ports/unit-of-work.js';

@Injectable()
export class PrismaPostsRepository implements PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  getClient(ctx?: TransactionContext) {
    return (ctx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }
  async create(params: CreatePostRepositoryParams): Promise<number> {
    const { authorId, description, imageIds } = params;

    try {
      const post = await this.prisma.post.create({
        data: {
          authorId,
          description,
          images: {
            create: imageIds.map((fileId, position) => ({ fileId, position })),
          },
        },
        select: { id: true },
      });

      return post.id;
    } catch (error) {
      // Primary key по fileId остаётся окончательной защитой от двух конкурентных запросов,
      // пытающихся прикрепить одно изображение. Преобразуем ошибку БД в ожидаемый 409 Conflict.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PostImageAlreadyAttachedError();
      }

      throw error;
    }
  }
  async findByIdAndAuthorId(id: number, authorId: number): Promise<Post | null> {
    const post = await this.prisma.post.findUnique({
      where: { id: id, deletedAt: null, authorId: authorId },
      include: { images: { orderBy: { position: 'asc' } } },
    });
    if (!post) {
      return null;
    }
    return PostPrismaMapper.toDomain(post);
  }

  async findById(id: number): Promise<Post | null> {
    const post = await this.prisma.post.findUnique({
      where: { id: id, deletedAt: null },
      include: { images: { orderBy: { position: 'asc' } } },
    });
    if (!post) {
      return null;
    }
    return PostPrismaMapper.toDomain(post);
  }
  async updateAuthorPost(params: UpdateAuthorPostRepositoryParams): Promise<number> {
    const { authorId, id, expectedVersion, fields } = params;
    //При обновлении используем подход optimistic lock
    try {
      const result = await this.prisma.post.update({
        where: { authorId: authorId, id: id, version: expectedVersion, deletedAt: null },
        data: {
          description: fields.description,
          version: {
            increment: 1,
          },
        },
        select: { id: true },
      });
      return result.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new PostUpdateConflictError();
      }
      throw error;
    }
  }

  async softDeleteById(
    params: SoftDeletePostRepositoryParams,
    ctx?: TransactionContext,
  ): Promise<SoftDeletePostResult | null> {
    const client = this.getClient(ctx);
    try {
      const { authorId, id } = params;
      const deleted = await client.post.update({
        where: { authorId: authorId, id: id, deletedAt: null },
        data: {
          version: {
            increment: 1,
          },
          deletedAt: new Date(), // Standard JS equivalent to SQL NOW()
        },
        select: { id: true, authorId: true, deletedAt: true, images: { select: { fileId: true } } },
      });
      return {
        id: deleted.id,
        authorId: deleted.authorId,
        filedIds: deleted.images.map((image) => image.fileId),
        deletedAt: deleted.deletedAt as Date,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        // A conditional update misses when the post was concurrently removed or already
        // soft-deleted. This is an expected outcome of an idempotent delete, not a failure.
        return null;
      }
      throw error;
    }
  }

  async clearSoftDeleted(batchLimit: number): Promise<number> {
    const batchPayload = await this.prisma.post.deleteMany({
      where: { deletedAt: { not: null } },
      limit: batchLimit,
    });
    return batchPayload.count;
  }
}
