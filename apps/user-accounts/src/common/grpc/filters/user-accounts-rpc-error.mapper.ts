import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';
import { type UserAccountsError, UserAccountsErrorCode } from '../../errors/user-accounts.error.js';

const GRPC_STATUS_BY_APP_ERROR_CODE = {
  [UserAccountsErrorCode.INCORRECT_CREDENTIALS]: status.UNAUTHENTICATED,
  [UserAccountsErrorCode.INVALID_REFRESH_TOKEN]: status.UNAUTHENTICATED,
  [UserAccountsErrorCode.NO_ACTIVE_SESSION]: status.UNAUTHENTICATED,
  [UserAccountsErrorCode.INVALID_USER_ID]: status.UNAUTHENTICATED,
  [UserAccountsErrorCode.EMAIL_NOT_CONFIRMED]: status.FAILED_PRECONDITION,
  [UserAccountsErrorCode.USER_ALREADY_LOGGED_IN]: status.FAILED_PRECONDITION,
  [UserAccountsErrorCode.EMAIL_ALREADY_CONFIRMED]: status.FAILED_PRECONDITION,
  [UserAccountsErrorCode.CONFIRMATION_CODE_EXPIRED]: status.FAILED_PRECONDITION,
  [UserAccountsErrorCode.USERNAME_ALREADY_EXISTS]: status.ALREADY_EXISTS,
  [UserAccountsErrorCode.EMAIL_ALREADY_EXISTS]: status.ALREADY_EXISTS,
  [UserAccountsErrorCode.SESSION_NOT_FOUND]: status.NOT_FOUND,
  [UserAccountsErrorCode.SESSION_ACCESS_DENIED]: status.PERMISSION_DENIED,
  [UserAccountsErrorCode.INVALID_PASSWORD_RESET_TOKEN]: status.INVALID_ARGUMENT,
  [UserAccountsErrorCode.INVALID_CONFIRMATION_CODE]: status.INVALID_ARGUMENT,
  [UserAccountsErrorCode.INCORRECT_EMAIL]: status.INVALID_ARGUMENT,
  [UserAccountsErrorCode.OAUTH_EMAIL_REQUIRED]: status.FAILED_PRECONDITION,
  [UserAccountsErrorCode.OAUTH_EMAIL_NOT_VERIFIED]: status.FAILED_PRECONDITION,
  [UserAccountsErrorCode.OAUTH_EMAIL_CONFIRMATION_REQUIRED]: status.FAILED_PRECONDITION,
  [UserAccountsErrorCode.OAUTH_IDENTITY_OWNER_NOT_FOUND]: status.NOT_FOUND,
  [UserAccountsErrorCode.OAUTH_SESSION_CREATION_FAILED]: status.FAILED_PRECONDITION,
  [UserAccountsErrorCode.OAUTH_IDENTITY_LINKED_TO_ANOTHER_USER]: status.ALREADY_EXISTS,
  [UserAccountsErrorCode.OAUTH_PROVIDER_ALREADY_LINKED]: status.ALREADY_EXISTS,
  [UserAccountsErrorCode.OAUTH_IDENTITY_CONFLICT]: status.ABORTED,
} satisfies Record<UserAccountsErrorCode, status>;

export const mapUserAccountsErrorToRpcException = (error: UserAccountsError): RpcException => {
  const appErrorCode = error.code;
  const grpcStatus = GRPC_STATUS_BY_APP_ERROR_CODE[appErrorCode];

  const metadata = new Metadata();
  metadata.set(USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY, appErrorCode);

  // Формат gRPC требует поле code, но в него записывается именно статус gRPC.
  return new RpcException({ code: grpcStatus, message: error.message, metadata });
};
