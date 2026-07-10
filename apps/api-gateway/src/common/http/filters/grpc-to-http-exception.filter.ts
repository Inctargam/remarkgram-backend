import { Catch, HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { type Metadata, status } from '@grpc/grpc-js';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';
import { ApiErrorResponseDto } from '../api-error-response.dto.js';

type GrpcServiceError = {
  // grpc-js называет это поле code, хотя его значение является статусом gRPC.
  code: status;
  details?: string;
  message?: string;
  metadata?: Metadata;
};

const HTTP_STATUS_BY_GRPC_STATUS: Partial<Record<status, HttpStatus>> = {
  [status.INVALID_ARGUMENT]: HttpStatus.BAD_REQUEST,
  [status.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [status.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [status.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [status.ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [status.FAILED_PRECONDITION]: HttpStatus.CONFLICT,
  [status.RESOURCE_EXHAUSTED]: HttpStatus.TOO_MANY_REQUESTS,
  [status.UNIMPLEMENTED]: HttpStatus.NOT_IMPLEMENTED,
  [status.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [status.DEADLINE_EXCEEDED]: HttpStatus.GATEWAY_TIMEOUT,
};

export const mapGrpcErrorToHttpException = (error: GrpcServiceError): HttpException => {
  const grpcStatus = error.code;
  const httpStatus = HTTP_STATUS_BY_GRPC_STATUS[grpcStatus] ?? HttpStatus.BAD_GATEWAY;
  const appErrorCode =
    error.metadata?.get(USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY)[0]?.toString() ||
    status[grpcStatus] ||
    'UPSTREAM_ERROR';
  const message = error.details || error.message || 'Upstream gRPC service is unavailable';

  return new HttpException(new ApiErrorResponseDto(httpStatus, appErrorCode, message), httpStatus);
};

/** Преобразует ошибки исходящих gRPC-вызовов в HTTP-ответы API Gateway. */
@Catch()
export class GrpcToHttpExceptionFilter extends BaseExceptionFilter {
  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  /** Обрабатывает gRPC-ошибку, а остальные исключения передаёт стандартному фильтру Nest. */
  override catch(error: unknown, host: ArgumentsHost): void {
    super.catch(this.isGrpcError(error) ? mapGrpcErrorToHttpException(error) : error, host);
  }

  /** Проверяет, что исключение содержит числовой статус из enum gRPC. */
  private isGrpcError(error: unknown): error is GrpcServiceError {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    const grpcStatus = error.code;
    return typeof grpcStatus === 'number' && Number.isInteger(grpcStatus) && status[grpcStatus] !== undefined;
  }
}
