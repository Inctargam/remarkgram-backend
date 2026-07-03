import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import {
  type UserAccountsError,
  UserAccountsErrorCode,
} from '../../application/errors/user-accounts.error.js';

export const mapUserAccountsErrorToRpcException = (error: UserAccountsError): RpcException => {
  let grpcStatus: status;
  let message = error.message;

  switch (error.code) {
    case UserAccountsErrorCode.INCORRECT_CREDENTIALS:
    case UserAccountsErrorCode.INVALID_REFRESH_TOKEN:
    case UserAccountsErrorCode.NO_ACTIVE_SESSION:
    case UserAccountsErrorCode.INVALID_USER_ID:
      grpcStatus = status.UNAUTHENTICATED;
      break;

    case UserAccountsErrorCode.EMAIL_NOT_CONFIRMED:
    case UserAccountsErrorCode.USER_ALREADY_LOGGED_IN:
    case UserAccountsErrorCode.EMAIL_ALREADY_CONFIRMED:
    case UserAccountsErrorCode.CONFIRMATION_CODE_EXPIRED:
      grpcStatus = status.FAILED_PRECONDITION;
      break;

    case UserAccountsErrorCode.USERNAME_ALREADY_EXISTS:
    case UserAccountsErrorCode.EMAIL_ALREADY_EXISTS:
      grpcStatus = status.ALREADY_EXISTS;
      break;

    case UserAccountsErrorCode.SESSION_NOT_FOUND:
      grpcStatus = status.NOT_FOUND;
      break;

    case UserAccountsErrorCode.SESSION_ACCESS_DENIED:
      grpcStatus = status.PERMISSION_DENIED;
      break;

    case UserAccountsErrorCode.INVALID_CONFIRMATION_CODE:
    case UserAccountsErrorCode.INCORRECT_EMAIL:
      grpcStatus = status.INVALID_ARGUMENT;
      break;

    default:
      grpcStatus = status.INTERNAL;
      message = 'Internal user accounts error';
  }

  return new RpcException({ code: grpcStatus, message });
};
