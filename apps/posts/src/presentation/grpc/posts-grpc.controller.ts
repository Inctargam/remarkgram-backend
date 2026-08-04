import {
  PostsServiceControllerMethods,
  type CreatePostRequest,
  type CreatePostResponse,
} from '@app/posts-grpc';
import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CreatePostCommand } from '../../application/use-cases/create-post/create-post.use-case.js';
import { PostsRpcExceptionFilter } from './filters/posts-rpc-exception.filter.js';

@Controller()
@PostsServiceControllerMethods()
@UseFilters(PostsRpcExceptionFilter)
export class PostsGrpcController {
  constructor(private readonly commandBus: CommandBus) {}

  createPost(request: CreatePostRequest): Promise<CreatePostResponse> {
    return this.commandBus.execute(
      new CreatePostCommand({
        userId: Number(request.userId),
        description: request.description,
        imageIds: request.imageIds,
      }),
    );
  }
}
