import {
  PostsServiceControllerMethods,
  type CreatePostRequest,
  type CreatePostResponse,
  UpdatePostRequest,
  UpdatePostResponse,
  GetAuthPostsPaginatedRequest,
  GetAuthPostsPaginatedResponse,
} from '@app/posts-grpc';
import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreatePostCommand } from '../../application/use-cases/create-post/create-post.use-case.js';
import { PostsRpcExceptionFilter } from './filters/posts-rpc-exception.filter.js';
import { UpdatePostCommand } from '../../application/use-cases/update-post/update-post.use-case.js';
import { GetAuthorPostsQuery } from '../../application/use-cases/get-author-posts/get-author-posts.query-handler.js';

@Controller()
@PostsServiceControllerMethods()
@UseFilters(PostsRpcExceptionFilter)
export class PostsGrpcController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  createPost(request: CreatePostRequest): Promise<CreatePostResponse> {
    return this.commandBus.execute(
      new CreatePostCommand({
        userId: Number(request.userId),
        description: request.description,
        imageIds: request.imageIds,
      }),
    );
  }
  async updatePost(request: UpdatePostRequest): Promise<UpdatePostResponse> {
    await this.commandBus.execute(
      new UpdatePostCommand({
        authorId: Number(request.userId),
        postId: Number(request.postId),
        description: request.description,
      }),
    );
    return {};
  }
  async getAuthPostsPaginated(request: GetAuthPostsPaginatedRequest): Promise<GetAuthPostsPaginatedResponse> {
    return await this.queryBus.execute(
      new GetAuthorPostsQuery({
        authorId: Number(request.userId),
        limit: request.limit,
        cursor: request?.cursor,
      }),
    );
  }
}
