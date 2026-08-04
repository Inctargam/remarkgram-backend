import { POSTS_APP_ERROR_CODE_METADATA_KEY } from '@app/posts-grpc';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { type PostsError, PostsErrorCode } from '../../../application/errors/posts.error.js';

const GRPC_STATUS_BY_APP_ERROR_CODE = {
  [PostsErrorCode.INVALID_USER_ID]: status.INVALID_ARGUMENT,
  [PostsErrorCode.INVALID_POST_DESCRIPTION]: status.INVALID_ARGUMENT,
  [PostsErrorCode.INVALID_POST_IMAGE_COUNT]: status.INVALID_ARGUMENT,
  [PostsErrorCode.DUPLICATE_POST_IMAGE_ID]: status.INVALID_ARGUMENT,
  [PostsErrorCode.POST_IMAGE_NOT_FOUND]: status.NOT_FOUND,
  [PostsErrorCode.POST_IMAGE_NOT_COMPLETED]: status.FAILED_PRECONDITION,
  [PostsErrorCode.POST_IMAGE_ALREADY_ATTACHED]: status.ALREADY_EXISTS,
  [PostsErrorCode.IMAGE_UPLOADS_SERVICE_UNAVAILABLE]: status.UNAVAILABLE,
} satisfies Record<PostsErrorCode, status>;

export const mapPostsErrorToRpcException = (error: PostsError): RpcException => {
  const metadata = new Metadata();
  metadata.set(POSTS_APP_ERROR_CODE_METADATA_KEY, error.code);

  return new RpcException({
    code: GRPC_STATUS_BY_APP_ERROR_CODE[error.code],
    message: error.message,
    metadata,
  });
};
