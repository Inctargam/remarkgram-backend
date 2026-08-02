import { Catch, HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { Metadata, type ServiceError, status } from '@grpc/grpc-js';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { FILES_APP_ERROR_CODE_METADATA_KEY } from '@app/files-grpc';
import { USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';
import { ApiErrorResponseDto } from '../api-error-response.dto.js';

function isServiceError(error: unknown): error is ServiceError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'number' &&
    Number.isInteger(error.code) &&
    status[error.code] !== undefined &&
    'details' in error &&
    typeof error.details === 'string' &&
    'metadata' in error &&
    error.metadata instanceof Metadata
  );
}

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

export const mapGrpcErrorToHttpException = (error: ServiceError): HttpException => {
  // grpc-js восстанавливает ServiceError на клиенте: code приходит из grpc-status,
  // details — из grpc-message, а точный application error code лежит в custom trailing metadata.
  const grpcStatus = error.code;
  const httpStatus = HTTP_STATUS_BY_GRPC_STATUS[grpcStatus] ?? HttpStatus.BAD_GATEWAY;
  const appErrorCode =
    error.metadata?.get(FILES_APP_ERROR_CODE_METADATA_KEY).at(0)?.toString() ??
    error.metadata?.get(USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY).at(0)?.toString() ??
    status[grpcStatus] ??
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
    // Исходящий Nest gRPC client возвращает Observable; при неуспешном status firstValueFrom
    // выбрасывает клиентский ServiceError, который здесь преобразуется в HttpException с JSON body.
    super.catch(isServiceError(error) ? mapGrpcErrorToHttpException(error) : error, host);
  }
}
