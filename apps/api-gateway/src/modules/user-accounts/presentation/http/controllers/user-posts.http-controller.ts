import { Controller, Get, Inject, OnModuleInit, Param, Query } from '@nestjs/common';
import { REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME } from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import { POSTS_SERVICE_NAME, PostsServiceClient } from '@app/posts-grpc';
import { firstValueFrom } from 'rxjs';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetAuthorPostsParamsDto } from '../dto/input/get-author-posts-params.dto.js';
import { GetAuthorPostsQueryDto } from '../dto/input/get-author-posts-query.dto.js';
import { GetAuthorPostsResponseDto } from '../dto/output/get-author-posts/get-author-posts-response.dto.js';
import { GetAuthorPostsResponseMapper } from '../mappers/get-author-posts-response.mapper.js';

@ApiTags('Posts')
@Controller('users/:userId')
export class UserPostsHttpController implements OnModuleInit {
  private postsGrpcClient!: PostsServiceClient;
  constructor(@Inject(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME) private readonly grpcClient: ClientGrpc) {}
  onModuleInit() {
    this.postsGrpcClient = this.grpcClient.getService<PostsServiceClient>(POSTS_SERVICE_NAME);
  }
  @Public()
  @Get('posts')
  @ApiOperation({ summary: "Get an author's posts using cursor pagination" })
  @ApiOkResponse({
    description: "The requested page of the author's posts.",
    type: GetAuthorPostsResponseDto,
  })
  async getAuthorPosts(
    @Param() params: GetAuthorPostsParamsDto,
    @Query() query: GetAuthorPostsQueryDto,
  ): Promise<GetAuthorPostsResponseDto> {
    const grpcResponse = await firstValueFrom(
      this.postsGrpcClient.getAuthPostsPaginated({
        userId: params.userId.toString(),
        limit: query.limit,
        cursor: query.cursor,
      }),
    );

    return GetAuthorPostsResponseMapper.toResponse(grpcResponse);
  }
}
