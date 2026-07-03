import { Catch, type ArgumentsHost } from '@nestjs/common';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';
import { UserAccountsError } from '../../application/errors/user-accounts.error.js';
import { mapUserAccountsErrorToRpcException } from './user-accounts-rpc-error.mapper.js';

@Catch(UserAccountsError)
export class UserAccountsRpcExceptionFilter extends BaseRpcExceptionFilter {
  override catch(error: UserAccountsError, host: ArgumentsHost): ReturnType<BaseRpcExceptionFilter['catch']> {
    return super.catch(mapUserAccountsErrorToRpcException(error), host);
  }
}
