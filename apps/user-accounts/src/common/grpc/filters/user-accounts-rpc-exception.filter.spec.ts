import { status } from '@grpc/grpc-js';
import { USER_ACCOUNTS_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';
import type { ArgumentsHost } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  EmailNotConfirmedError,
  InvalidRefreshTokenError,
} from '../../../features/auth/application/errors/auth.errors.js';
import {
  SessionAccessDeniedError,
  SessionNotFoundError,
} from '../../../features/sessions/application/errors/sessions.errors.js';
import {
  InvalidConfirmationCodeError,
  UsernameAlreadyExistsError,
} from '../../../features/users/application/errors/users.errors.js';
import { UserAccountsRpcExceptionFilter } from './user-accounts-rpc-exception.filter.js';

describe('UserAccountsRpcExceptionFilter', () => {
  const filter = new UserAccountsRpcExceptionFilter();
  const host = {} as ArgumentsHost;

  it.each([
    [new InvalidRefreshTokenError(), status.UNAUTHENTICATED],
    [new EmailNotConfirmedError(), status.FAILED_PRECONDITION],
    [new UsernameAlreadyExistsError(), status.ALREADY_EXISTS],
    [new SessionNotFoundError(), status.NOT_FOUND],
    [new SessionAccessDeniedError(), status.PERMISSION_DENIED],
    [new InvalidConfirmationCodeError(), status.INVALID_ARGUMENT],
  ])('maps %s to the corresponding gRPC status', async (error, code) => {
    const rpcError: unknown = await firstValueFrom(filter.catch(error, host)).catch(
      (caught: unknown) => caught,
    );

    expect(rpcError).toEqual(
      expect.objectContaining({
        code,
        message: error.message,
      }),
    );
    expect(
      (rpcError as { metadata: { get(key: string): unknown[] } }).metadata.get(
        USER_ACCOUNTS_ERROR_CODE_METADATA_KEY,
      ),
    ).toEqual([error.code]);
  });
});
