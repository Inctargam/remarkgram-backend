import { Body, Controller, Get, Post } from '@nestjs/common';
import { PostResponseDto } from '../dto/post-response.dto.js';
import { PostsRepository } from '../../../application/ports/posts.repository.js';
import { CreatePostDto } from '../dto/create-post.dto.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreatePostCommand } from '../../../application/use-cases/crate-post/create-post.use-case.js';

@Controller('posts')
export class PostsController {
  constructor(
    protected postsRepository: PostsRepository,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('')
  async getPosts(): Promise<PostResponseDto[]> {
    const posts = await this.postsRepository.findAll();
    return posts.map((p) => PostResponseDto.fromDomain(p));
  }

  @Post('')
  async createPost(@Body() postDto: CreatePostDto): Promise<{ id: number }> {
    return this.commandBus.execute(new CreatePostCommand(postDto.title, postDto.content));
  }
}
