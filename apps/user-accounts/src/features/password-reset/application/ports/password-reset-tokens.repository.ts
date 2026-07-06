import type { PasswordResetToken } from '../../domain/entities/password-reset-token.entity.js';
import type { CreatePasswordResetTokenParams } from '../types/password-reset.types.js';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';

export abstract class PasswordResetTokensRepository {
  abstract create(
    params: CreatePasswordResetTokenParams,
    ctx?: TransactionContext,
  ): Promise<PasswordResetToken>;

  abstract findByTokenHash(tokenHash: string, ctx?: TransactionContext): Promise<PasswordResetToken | null>;
  // Selector/verifier alternative: findBySelector(selector), then compare hashToken(verifier) with stored verifierHash.

  abstract revokeActiveByUserId(userId: number, revokedAt: Date, ctx?: TransactionContext): Promise<void>;

  abstract markAsUsed(tokenId: string, usedAt: Date, ctx?: TransactionContext): Promise<boolean>;

  abstract existsCreatedAfter(
    userId: number,
    cooldownStartedAt: Date,
    ctx?: TransactionContext,
  ): Promise<boolean>;
}
