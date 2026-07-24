import { type ServiceError, status } from '@grpc/grpc-js';

/**
 * Минимальная форма клиентской ошибки grpc-js, которую использует API Gateway.
 * Настоящий ServiceError содержит все эти поля, но при обработке unknown
 * обязательным для распознавания остаётся только числовой gRPC status.
 */
export type GrpcServiceError = Pick<ServiceError, 'code'> &
  Partial<Pick<ServiceError, 'details' | 'message' | 'metadata'>>;

export function isGrpcServiceError(error: unknown): error is GrpcServiceError {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  const grpcStatus = error.code;
  // На wire-уровне это значение приходит в grpc-status, но grpc-js хранит его в ServiceError.code.
  return typeof grpcStatus === 'number' && Number.isInteger(grpcStatus) && status[grpcStatus] !== undefined;
}

export function getGrpcMetadataValue(error: unknown, key: string): string | undefined {
  if (!isGrpcServiceError(error)) return undefined;

  // ServiceError.metadata содержит trailing metadata финального gRPC status.
  // Конкретный key и его значение являются соглашением приложения, а не частью protobuf response.
  return error.metadata?.get(key).at(0)?.toString();
}
