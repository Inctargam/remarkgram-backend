import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

export function createUnauthenticatedRpcException(error: unknown): RpcException {
  const message = error instanceof Error ? error.message : 'Authentication failed';
  const authenticationErrors = new Set([
    'Incorrect login/password',
    'Email has not been confirmed',
    'The user is already logged in',
    'Invalid refresh token',
    'No active session found',
  ]);

  if (!authenticationErrors.has(message)) {
    return new RpcException({
      code: status.INTERNAL,
      message: 'Internal user accounts error',
    });
  }

  return new RpcException({
    code: status.UNAUTHENTICATED,
    message,
  });
}
