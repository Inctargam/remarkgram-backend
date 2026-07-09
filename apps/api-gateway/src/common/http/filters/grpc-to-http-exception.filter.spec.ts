import { Metadata, status } from '@grpc/grpc-js';
import { HttpStatus } from '@nestjs/common';
import { USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';
import { mapGrpcErrorToHttpException } from './grpc-to-http-exception.filter.js';

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
    const exception = mapGrpcErrorToHttpException({
      code: grpcStatus,
      details: 'Request failed',
    });

    expect(exception.getStatus()).toBe(httpStatus);
    expect(exception.getResponse()).toEqual({
      statusCode: httpStatus,
      code: appErrorCode,
      message: 'Request failed',
    });
  });

  it('preserves the application error code from gRPC metadata', () => {
    const metadata = new Metadata();
    metadata.set(USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY, 'EMAIL_NOT_CONFIRMED');

    const exception = mapGrpcErrorToHttpException({
      code: status.FAILED_PRECONDITION,
      details: 'Email has not been confirmed',
      metadata,
    });

    expect(exception.getResponse()).toEqual({
      statusCode: HttpStatus.CONFLICT,
      code: 'EMAIL_NOT_CONFIRMED',
      message: 'Email has not been confirmed',
    });
  });
});
