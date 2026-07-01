import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  type HttpException,
} from '@nestjs/common';
import { status } from '@grpc/grpc-js';

type GrpcError = {
  code?: unknown;
  details?: unknown;
  message?: unknown;
};

export function mapGrpcErrorToHttp(error: unknown): HttpException {
  const grpcError = typeof error === 'object' && error !== null ? (error as GrpcError) : {};
  const message =
    typeof grpcError.details === 'string'
      ? grpcError.details
      : typeof grpcError.message === 'string'
        ? grpcError.message
        : 'User accounts service is unavailable';

  switch (grpcError.code) {
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
