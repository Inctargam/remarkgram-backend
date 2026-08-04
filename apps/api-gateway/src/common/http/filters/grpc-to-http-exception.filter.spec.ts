import { Metadata, type ServiceError, status } from '@grpc/grpc-js';
import { HttpStatus } from '@nestjs/common';
import { FILES_APP_ERROR_CODE_METADATA_KEY } from '@app/files-grpc';
import { POSTS_APP_ERROR_CODE_METADATA_KEY } from '@app/posts-grpc';
import { USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';
import { mapGrpcErrorToHttpException } from './grpc-to-http-exception.filter.js';

const createServiceError = (
  code: status,
  details = 'Request failed',
  metadata = new Metadata(),
): ServiceError => Object.assign(new Error(details), { code, details, metadata });

describe('mapGrpcErrorToHttpException', () => {
  it.each([
    [status.INVALID_ARGUMENT, HttpStatus.BAD_REQUEST, 'INVALID_ARGUMENT'],
    [status.UNAUTHENTICATED, HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED'],
    [status.PERMISSION_DENIED, HttpStatus.FORBIDDEN, 'PERMISSION_DENIED'],
    [status.NOT_FOUND, HttpStatus.NOT_FOUND, 'NOT_FOUND'],
    [status.ALREADY_EXISTS, HttpStatus.CONFLICT, 'ALREADY_EXISTS'],
    [status.FAILED_PRECONDITION, HttpStatus.CONFLICT, 'FAILED_PRECONDITION'],
    [status.RESOURCE_EXHAUSTED, HttpStatus.TOO_MANY_REQUESTS, 'RESOURCE_EXHAUSTED'],
    [status.UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE, 'UNAVAILABLE'],
    [status.DEADLINE_EXCEEDED, HttpStatus.GATEWAY_TIMEOUT, 'DEADLINE_EXCEEDED'],
  ])('maps gRPC status %s to HTTP status %s', (grpcStatus, httpStatus, appErrorCode) => {
    const exception = mapGrpcErrorToHttpException(createServiceError(grpcStatus));

    expect(exception.getStatus()).toBe(httpStatus);
    expect(exception.getResponse()).toEqual({
      statusCode: httpStatus,
      code: appErrorCode,
      message: 'Request failed',
    });
  });

  it.each([
    [USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY, 'EMAIL_NOT_CONFIRMED'],
    [FILES_APP_ERROR_CODE_METADATA_KEY, 'INVALID_IMAGE_SIZE'],
    [POSTS_APP_ERROR_CODE_METADATA_KEY, 'POST_IMAGE_NOT_COMPLETED'],
  ])('preserves the application error code from %s gRPC metadata', (metadataKey, errorCode) => {
    const metadata = new Metadata();
    metadata.set(metadataKey, errorCode);

    const exception = mapGrpcErrorToHttpException(
      createServiceError(status.FAILED_PRECONDITION, 'Request failed', metadata),
    );

    expect(exception.getResponse()).toEqual({
      statusCode: HttpStatus.CONFLICT,
      code: errorCode,
      message: 'Request failed',
    });
  });
});
