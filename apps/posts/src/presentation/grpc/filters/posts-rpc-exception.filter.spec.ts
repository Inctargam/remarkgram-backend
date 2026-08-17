import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import { status } from '@grpc/grpc-js';
import type { ArgumentsHost } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  DuplicatePostImageIdError,
  ImageUploadsServiceUnavailableError,
  InvalidPostDescriptionError,
  InvalidPostImageCountError,
  InvalidUserIdError,
  PostImageAlreadyAttachedError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../../application/errors/create-post.errors.js';
import { PostsRpcExceptionFilter } from './posts-rpc-exception.filter.js';
import {
  PostUpdateConflictError,
  PostUpdateForbiddenError,
} from '../../../application/errors/update-post.errors.js';
import {
  InvalidPostIdError,
  PostAccessForbiddenError,
  PostNotFoundError,
} from '../../../application/errors/base-post.errors.js';
import {
  InvalidPostsCursorError,
  InvalidPostsPageLimitError,
} from '../../../application/errors/post-pagination.errors.js';

describe('PostsRpcExceptionFilter', () => {
  const filter = new PostsRpcExceptionFilter();
  const host = {} as ArgumentsHost;

  it.each([
    [new InvalidUserIdError(), status.INVALID_ARGUMENT],
    [new InvalidPostDescriptionError(), status.INVALID_ARGUMENT],
    [new InvalidPostImageCountError(), status.INVALID_ARGUMENT],
    [new DuplicatePostImageIdError(), status.INVALID_ARGUMENT],
    [new PostImageNotFoundError(), status.NOT_FOUND],
    [new PostImagesNotAvailableError(), status.FAILED_PRECONDITION],
    [new PostImageAlreadyAttachedError(), status.ALREADY_EXISTS],
    [new ImageUploadsServiceUnavailableError(), status.UNAVAILABLE],
    [new PostUpdateForbiddenError(), status.PERMISSION_DENIED],
    [new PostAccessForbiddenError(), status.PERMISSION_DENIED],
    [new PostUpdateConflictError(), status.ALREADY_EXISTS],
    [new InvalidPostIdError(), status.INVALID_ARGUMENT],
    [new PostNotFoundError(), status.NOT_FOUND],
    [new InvalidPostsPageLimitError(), status.INVALID_ARGUMENT],
    [new InvalidPostsCursorError(), status.INVALID_ARGUMENT],
  ] as const)('maps $0.code to gRPC status $1', async (error, grpcStatus) => {
    const rpcError: unknown = await firstValueFrom(filter.catch(error, host)).catch(
      (caught: unknown) => caught,
    );
    expect(rpcError).toEqual(
      expect.objectContaining({
        code: grpcStatus,
        message: error.message,
      }),
    );
    expect(
      (rpcError as { metadata: { get(key: string): unknown[] } }).metadata.get(APP_ERROR_CODE_METADATA_KEY),
    ).toEqual([error.code]);
  });
});
