import { Catch, type ArgumentsHost } from '@nestjs/common';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';
import { PostsError } from '../../../application/errors/posts.error.js';
import { mapPostsErrorToRpcException } from './posts-rpc-error.mapper.js';

@Catch(PostsError)
export class PostsRpcExceptionFilter extends BaseRpcExceptionFilter {
  override catch(error: PostsError, host: ArgumentsHost): ReturnType<BaseRpcExceptionFilter['catch']> {
    return super.catch(mapPostsErrorToRpcException(error), host);
  }
}
