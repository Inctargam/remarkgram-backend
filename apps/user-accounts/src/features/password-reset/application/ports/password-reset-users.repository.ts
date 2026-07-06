import type { PasswordResetUser } from '../types/password-reset.types.js';
import type { Prisma } from '../../../../database/generated/client.js';

export abstract class PasswordResetUsersRepository {
  abstract findByConfirmedEmail(
    email: string,
    ctx?: Prisma.TransactionClient,
  ): Promise<PasswordResetUser | null>;

  abstract updatePasswordHash(
    userId: number,
    passwordHash: string,
    ctx?: Prisma.TransactionClient,
  ): Promise<boolean>;
}
