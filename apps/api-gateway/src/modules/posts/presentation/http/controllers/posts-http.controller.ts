import {
  POSTS_SERVICE_NAME,
  REMARKGRAM_POSTS_V1_PACKAGE_NAME,
  type CreatePostResponse,
  type PostsServiceClient,
} from '@app/posts-grpc';
import { Body, Controller, HttpCode, HttpStatus, Inject, type OnModuleInit, Post, Req } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { CreatePostDto } from '../dto/input/create-post.dto.js';
import { ApiCreatePost } from '../swagger/post/create-post.swagger.js';
import { ApiPostsController } from '../swagger/posts-controller.swagger.js';

type AuthenticatedRequest = Request & { userId: string };

@ApiPostsController()
@Controller('posts')
export class PostsHttpController implements OnModuleInit {
  private postsClient!: PostsServiceClient;

  constructor(
    @Inject(REMARKGRAM_POSTS_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.postsClient = this.grpcClient.getService<PostsServiceClient>(POSTS_SERVICE_NAME);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatePost()
  createPost(
    @Body() input: CreatePostDto,
    @Req() request: AuthenticatedRequest,
  ): Observable<CreatePostResponse> {
    return this.postsClient.createPost({
      userId: request.userId,
      description: input.description,
      imageIds: input.imageIds,
    });
  }
}
