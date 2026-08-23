import { Injectable } from '@nestjs/common';
import { PostImageAlreadyAttachedError } from '../../../application/errors/create-post.errors.js';
import { PostsRepository } from '../../../application/ports/posts.repository.js';
import type { Post } from '../../../domain/entities/post.entity.js';
import type {
  CreatePostRepositoryParams,
  UpdateAuthorPostRepositoryParams,
} from '../../../application/types/posts.types.js';
import { Prisma } from '../generated/client.js';
import { PrismaService } from '../prisma.service.js';
import { PostUpdateConflictError } from '../../../application/errors/update-post.errors.js';
import { PostNotFoundError } from '../../../application/errors/base-post.errors.js';
import { PostPrismaMapper } from '../mappers/post-prisma.mapper.js';
import type { TransactionContext } from '../../../application/ports/unit-of-work.js';

@Injectable()
export class PrismaPostsRepository implements PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreatePostRepositoryParams, ctx?: TransactionContext): Promise<number> {
    const { authorId, description, imageIds } = params;
    const client = this.getClient(ctx);

    try {
      const post = await client.post.create({
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

  async publish(id: number, ctx?: TransactionContext): Promise<void> {
    const client = this.getClient(ctx);
    await client.post.update({
      where: { id, publishedAt: null, deletedAt: null },
      data: { publishedAt: new Date() },
      select: { id: true },
    });
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
    id: number,
    authorId: number,
  ): Promise<{
    id: number;
    images: {
      fileId: string;
    }[];
  }> {
    try {
      const result = await this.prisma.post.update({
        where: { authorId: authorId, id: id, deletedAt: null },
        data: {
          version: {
            increment: 1,
          },
          deletedAt: new Date(), // Standard JS equivalent to SQL NOW()
        },
        select: { id: true, images: { select: { fileId: true } } },
      });
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        //::TODO определить тип ошибки
        throw new PostNotFoundError();
      }
      throw error;
    }
  }

  private getClient(ctx?: TransactionContext): Prisma.TransactionClient | PrismaService {
    return ctx ? (ctx as Prisma.TransactionClient) : this.prisma;
  }
}
