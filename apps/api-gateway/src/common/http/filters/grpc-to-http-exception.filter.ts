import { Catch, HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { type Metadata, status } from '@grpc/grpc-js';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { USER_ACCOUNTS_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';
import { ApiErrorResponseDto } from '../api-error-response.dto.js';

export type GrpcError = {
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

export const mapGrpcErrorToHttpException = (error: GrpcError): HttpException => {
  const httpStatus = HTTP_STATUS_BY_GRPC_STATUS[error.code] ?? HttpStatus.BAD_GATEWAY;
  const metadataCode = error.metadata?.get(USER_ACCOUNTS_ERROR_CODE_METADATA_KEY)[0]?.toString();
  const errorCode = metadataCode || status[error.code] || 'UPSTREAM_ERROR';
  const message = error.details || error.message || 'Upstream gRPC service is unavailable';

  return new HttpException(new ApiErrorResponseDto(httpStatus, errorCode, message), httpStatus);
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

  /** Проверяет наличие числового status-кода из допустимого диапазона gRPC. */
  private isGrpcError(error: unknown): error is GrpcError {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    const code = error.code;
    return (
      typeof code === 'number' &&
      Number.isInteger(code) &&
      code >= Number(status.OK) &&
      code <= Number(status.UNAUTHENTICATED)
    );
  }
}
