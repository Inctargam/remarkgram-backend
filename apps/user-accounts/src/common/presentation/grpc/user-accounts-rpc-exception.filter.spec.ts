import { status } from '@grpc/grpc-js';
import type { ArgumentsHost } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { UserAccountsRpcExceptionFilter } from './user-accounts-rpc-exception.filter.js';

describe('UserAccountsRpcExceptionFilter', () => {
  const filter = new UserAccountsRpcExceptionFilter();
  const host = {} as ArgumentsHost;

  it('maps authentication errors to UNAUTHENTICATED', async () => {
    await expect(firstValueFrom(filter.catch(new Error('Invalid refresh token'), host))).rejects.toEqual({
      code: status.UNAUTHENTICATED,
      message: 'Invalid refresh token',
    });
  });

  it('does not expose unexpected errors', async () => {
    await expect(firstValueFrom(filter.catch(new Error('Database unavailable'), host))).rejects.toEqual({
      code: status.INTERNAL,
      message: 'Internal user accounts error',
    });
  });
});
