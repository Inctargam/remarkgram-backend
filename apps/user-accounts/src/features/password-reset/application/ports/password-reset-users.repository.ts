import type { PasswordResetUser } from '../types/password-reset.types.js';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';

export abstract class PasswordResetUsersRepository {
  abstract findByConfirmedEmail(email: string, ctx?: TransactionContext): Promise<PasswordResetUser | null>;

  abstract updatePasswordHash(
    userId: number,
    passwordHash: string,
    ctx?: TransactionContext,
  ): Promise<boolean>;
}
