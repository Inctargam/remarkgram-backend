import { POSTS_APP_ERROR_CODE_METADATA_KEY } from '@app/posts-grpc';
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
  PostImageNotCompletedError,
  PostImageNotFoundError,
} from '../../../application/errors/create-post.errors.js';
import { PostsRpcExceptionFilter } from './posts-rpc-exception.filter.js';

describe('PostsRpcExceptionFilter', () => {
  const filter = new PostsRpcExceptionFilter();
  const host = {} as ArgumentsHost;

  it.each([
    [new InvalidUserIdError(), status.INVALID_ARGUMENT],
    [new InvalidPostDescriptionError(), status.INVALID_ARGUMENT],
    [new InvalidPostImageCountError(), status.INVALID_ARGUMENT],
    [new DuplicatePostImageIdError(), status.INVALID_ARGUMENT],
    [new PostImageNotFoundError(), status.NOT_FOUND],
    [new PostImageNotCompletedError(), status.FAILED_PRECONDITION],
    [new PostImageAlreadyAttachedError(), status.ALREADY_EXISTS],
    [new ImageUploadsServiceUnavailableError(), status.UNAVAILABLE],
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
      (rpcError as { metadata: { get(key: string): unknown[] } }).metadata.get(
        POSTS_APP_ERROR_CODE_METADATA_KEY,
      ),
    ).toEqual([error.code]);
  });
});
