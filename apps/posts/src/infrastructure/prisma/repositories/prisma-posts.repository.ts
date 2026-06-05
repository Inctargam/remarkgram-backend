import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { Post } from '../../../domain/entities/post.entity.js';
import { PostPrismaMapper } from '../mappers/post-prisma.mapper.js';
import { PostsRepository } from '../../../application/ports/posts.repository.js';

@Injectable()
export class PrismaPostsRepository implements PostsRepository {
  constructor(protected prisma: PrismaService) {}

  async create(postDto: Post): Promise<Post> {
    const post = await this.prisma.post.create({
      data: {
        title: postDto.title,
        content: postDto.content,
      },
    });
    console.log('create ->', post);
    return PostPrismaMapper.toDomain(post);
  }

  async findAll(): Promise<Post[]> {
    const posts = await this.prisma.post.findMany();

    return posts.map((p) => Post.restore(p));
  }
}
