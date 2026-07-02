import {
  BadGatewayException,
  BadRequestException,
  Catch,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
  type HttpException,
} from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

type GrpcError = {
  code: status;
  details?: unknown;
  message?: unknown;
};

/** Преобразует ошибки исходящих gRPC-вызовов в HTTP-ответы API Gateway. */
@Catch()
export class GrpcToHttpExceptionFilter extends BaseExceptionFilter {
  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  /** Обрабатывает gRPC-ошибку, а остальные исключения передаёт стандартному фильтру Nest. */
  override catch(error: unknown, host: ArgumentsHost): void {
    super.catch(this.isGrpcError(error) ? this.mapToHttpException(error) : error, host);
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

  /** Сопоставляет gRPC status с соответствующим HTTP-исключением. */
  private mapToHttpException(error: GrpcError): HttpException {
    const message =
      typeof error.details === 'string'
        ? error.details
        : typeof error.message === 'string'
          ? error.message
          : 'Upstream gRPC service is unavailable';

    switch (error.code) {
      case status.INVALID_ARGUMENT:
        return new BadRequestException(message);
      case status.UNAUTHENTICATED:
        return new UnauthorizedException(message);
      case status.NOT_FOUND:
        return new NotFoundException(message);
      case status.ALREADY_EXISTS:
        return new ConflictException(message);
      default:
        return new BadGatewayException(message);
    }
  }
}
