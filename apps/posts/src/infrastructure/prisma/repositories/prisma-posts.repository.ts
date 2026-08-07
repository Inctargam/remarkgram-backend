import { Injectable } from '@nestjs/common';
import { PostImageAlreadyAttachedError } from '../../../application/errors/create-post.errors.js';
import {
  PostForUpdate,
  PostsRepository,
  UpdateAuthorPostParams,
} from '../../../application/ports/posts.repository.js';
import type { CreatePostRepositoryParams } from '../../../application/types/posts.types.js';
import { Prisma } from '../generated/client.js';
import { PrismaService } from '../prisma.service.js';
import { PostUpdateConflictError } from '../../../application/errors/update-post.errors.ts';

@Injectable()
export class PrismaPostsRepository implements PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  async findById(id: number): Promise<PostForUpdate | null> {
    const post = await this.prisma.post.findUnique({ where: { id: id } });
    if (!post) {
      return null;
    }
    return {
      id: post.id,
      authorId: post.authorId,
      version: post.version,
    };
  }
  async updateAuthorPost(params: UpdateAuthorPostParams): Promise<number> {
    const { authorId, id, expectedVersion, fields } = params;
    //При обновлении используем подход optimistic lock
    try {
      const result = await this.prisma.post.update({
        where: { authorId: authorId, id: id, version: expectedVersion },
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
}
