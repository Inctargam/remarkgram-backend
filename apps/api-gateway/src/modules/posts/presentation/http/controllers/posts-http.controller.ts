import {
  type CreatePostResponse,
  POSTS_SERVICE_NAME,
  type PostsServiceClient,
  REMARKGRAM_POSTS_V1_PACKAGE_NAME,
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
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { firstValueFrom, Observable } from 'rxjs';
import { CreatePostDto } from '../dto/input/create-post.dto.js';
import { CreatePostResponseDto } from '../dto/output/create-post-response.dto.js';
import { UpdatePostDto } from '../dto/input/update-post/update-post.dto.js';
import { UpdatePostByIdSwagger } from '../swagger/posts/put/update-post-by-id.swagger.js';

type AuthenticatedRequest = Request & { userId: string };

@ApiTags('Posts')
@ApiBearerAuth('accessToken')
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
  @ApiOperation({ summary: 'Create a post with uploaded images' })
  @ApiCreatedResponse({ type: CreatePostResponseDto })
  @ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' })
  @ApiServiceUnavailableResponse({ description: 'The posts or files service is unavailable.' })
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
  @UpdatePostByIdSwagger()
  updatePost(
    @Param('postId', ParseIntPipe) postId: number,
    @Body() input: UpdatePostDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return firstValueFrom(
      this.postsClient.updatePost({
        userId: request.userId,
        postId: postId.toString(),
        description: input.description,
      }),
    );
  }
}
