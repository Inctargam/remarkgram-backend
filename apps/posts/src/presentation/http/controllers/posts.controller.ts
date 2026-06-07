import { Body, Controller, Get, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { PostResponseDto } from '../dto/output/post-response.dto.js';
import { CreatePostDto } from '../dto/input/create-post.dto.js';
import { CreatePostCommand } from '../../../application/use-cases/create-post/create-post.use-case.js';
import { GetPostsQuery } from '../../../application/use-cases/get-posts/get-posts.use-case.js';

@Controller('posts')
export class PostsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('')
  async getPosts(): Promise<PostResponseDto[]> {
    const posts = await this.queryBus.execute(new GetPostsQuery());

    return posts.map((p) => PostResponseDto.mapToView(p));
  }

  @Post('')
  async createPost(@Body() postDto: CreatePostDto): Promise<{ id: number }> {
    return this.commandBus.execute(new CreatePostCommand(postDto.title, postDto.content));
  }
}
