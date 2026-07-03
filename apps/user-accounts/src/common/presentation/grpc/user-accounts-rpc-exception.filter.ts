import { Catch, type ArgumentsHost } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';

const authenticationErrors = new Set([
  'Incorrect email/password',
  'Email has not been confirmed',
  'The user is already logged in',
  'Invalid authorization method',
  'Invalid refresh token',
  'No active session found',
]);

@Catch()
export class UserAccountsRpcExceptionFilter extends BaseRpcExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost): ReturnType<BaseRpcExceptionFilter['catch']> {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    const rpcException = authenticationErrors.has(message)
      ? new RpcException({ code: status.UNAUTHENTICATED, message })
      : new RpcException({ code: status.INTERNAL, message: 'Internal user accounts error' });

    return super.catch(rpcException, host);
  }
}
