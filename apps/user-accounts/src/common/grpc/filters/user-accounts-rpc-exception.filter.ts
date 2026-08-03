import { Catch, type ArgumentsHost } from '@nestjs/common';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';
import { UserAccountsError } from '../../application/errors/user-accounts.error.js';
import { mapUserAccountsErrorToRpcException } from './user-accounts-rpc-error.mapper.js';

@Catch(UserAccountsError)
export class UserAccountsRpcExceptionFilter extends BaseRpcExceptionFilter {
  override catch(error: UserAccountsError, host: ArgumentsHost): ReturnType<BaseRpcExceptionFilter['catch']> {
    // Mapper оборачивает доменную ошибку в RpcException, а BaseRpcExceptionFilter извлекает из него payload
    // и завершает RPC error-событием. Далее grpc-js превращает payload.code в trailer grpc-status,
    // payload.message — в grpc-message, а payload.metadata отправляет как trailing metadata.
    return super.catch(mapUserAccountsErrorToRpcException(error), host);
  }
}
