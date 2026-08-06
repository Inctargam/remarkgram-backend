import { Injectable } from '@nestjs/common';
import { PostImageAlreadyAttachedError } from '../../../application/errors/create-post.errors.js';
import { PostsRepository } from '../../../application/ports/posts.repository.js';
import type { CreatePostRepositoryParams } from '../../../application/types/posts.types.js';
import { Prisma } from '../generated/client.js';
import { PrismaService } from '../prisma.service.js';

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
}
