import type { PasswordResetToken } from '../../domain/entities/password-reset-token.entity.js';
import type { CreatePasswordResetTokenParams } from '../types/password-reset.types.js';
import type { Prisma } from '../../../../database/generated/client.js';

export abstract class PasswordResetTokensRepository {
  abstract create(
    params: CreatePasswordResetTokenParams,
    ctx?: Prisma.TransactionClient,
  ): Promise<PasswordResetToken>;

  abstract findByTokenHash(
    tokenHash: string,
    ctx?: Prisma.TransactionClient,
  ): Promise<PasswordResetToken | null>;
  // Selector/verifier alternative: findBySelector(selector), then compare hashToken(verifier) with stored verifierHash.

  abstract revokeActiveByUserId(
    userId: number,
    revokedAt: Date,
    ctx?: Prisma.TransactionClient,
  ): Promise<void>;

  abstract markAsUsed(tokenId: string, usedAt: Date, ctx?: Prisma.TransactionClient): Promise<boolean>;

  abstract existsCreatedAfter(
    userId: number,
    cooldownStartedAt: Date,
    ctx?: Prisma.TransactionClient,
  ): Promise<boolean>;
}
