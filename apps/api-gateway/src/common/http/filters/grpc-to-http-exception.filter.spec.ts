import { Metadata, type ServiceError, status } from '@grpc/grpc-js';
import { HttpStatus } from '@nestjs/common';
import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
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

  it.each(['EMAIL_NOT_CONFIRMED', 'INVALID_IMAGE_SIZE', 'POST_IMAGES_NOT_AVAILABLE'])(
    'preserves the application error code %s from gRPC metadata',
    (errorCode) => {
      const metadata = new Metadata();
      metadata.set(APP_ERROR_CODE_METADATA_KEY, errorCode);

      const exception = mapGrpcErrorToHttpException(
        createServiceError(status.FAILED_PRECONDITION, 'Request failed', metadata),
      );

      expect(exception.getResponse()).toEqual({
        statusCode: HttpStatus.CONFLICT,
        code: errorCode,
        message: 'Request failed',
      });
    },
  );

  it('maps an idempotency-key conflict to HTTP 409 by its application error code', () => {
    const metadata = new Metadata();
    metadata.set(APP_ERROR_CODE_METADATA_KEY, 'POST_IDEMPOTENCY_KEY_CONFLICT');

    const exception = mapGrpcErrorToHttpException(
      createServiceError(status.INVALID_ARGUMENT, 'Idempotency-Key conflict', metadata),
    );

    expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(exception.getResponse()).toEqual({
      statusCode: HttpStatus.CONFLICT,
      code: 'POST_IDEMPOTENCY_KEY_CONFLICT',
      message: 'Idempotency-Key conflict',
    });
  });
});
