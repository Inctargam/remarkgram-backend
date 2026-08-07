import {
  POSTS_SERVICE_NAME,
  REMARKGRAM_POSTS_V1_PACKAGE_NAME,
  type CreatePostResponse,
  type PostsServiceClient,
  type UpdatePostResponse,
} from '@app/posts-grpc';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  type OnModuleInit,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Request } from 'express';
import { firstValueFrom, type Observable } from 'rxjs';
import { CreatePostDto } from '../dto/input/create-post.dto.js';
import { UpdatePostDto } from '../dto/input/update-post/update-post.dto.js';
import { ApiCreatePost } from '../swagger/post/create-post.swagger.js';
import { ApiPostsController } from '../swagger/posts-controller.swagger.js';
import { ApiUpdatePost } from '../swagger/put/update-post.swagger.js';

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

  @Put(':postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUpdatePost()
  updatePost(
    @Param('postId', ParseIntPipe) postId: number,
    @Body() input: UpdatePostDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UpdatePostResponse> {
    return firstValueFrom(
      this.postsClient.updatePost({
        userId: request.userId,
        postId: postId.toString(),
        description: input.description,
      }),
    );
  }
}
