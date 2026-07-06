import { PasswordResetTokensRepository } from '../../application/ports/password-reset-tokens.repository.js';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service.js';
import type { CreatePasswordResetTokenParams } from '../../application/types/password-reset.types.js';
import { PasswordResetToken } from '../../domain/entities/password-reset-token.entity.js';
import type { Prisma } from '../../../../database/generated/client.js';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';

type PasswordResetTokensPrismaClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PrismaPasswordRestTokensRepository extends PasswordResetTokensRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  getClient(ctx?: TransactionContext): PasswordResetTokensPrismaClient {
    return (ctx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  /** Создаёт токен сброса пароля и возвращает доменную модель с полями, сгенерированными БД. */
  async create(
    params: CreatePasswordResetTokenParams,
    ctx?: TransactionContext,
  ): Promise<PasswordResetToken> {
    const client = this.getClient(ctx);
    const passwordResetToken = await client.passwordResetToken.create({
      data: {
        tokenHash: params.tokenHash,
        userId: params.userId,
        expiresAt: params.expiresAt,
        createdAt: params.createdAt,
      },
    });
    return PasswordResetToken.restore(passwordResetToken);
  }

  /** Ищет токен сброса пароля по хешу сырого токена. */
  async findByTokenHash(tokenHash: string, ctx?: TransactionContext): Promise<PasswordResetToken | null> {
    const client = this.getClient(ctx);
    const passResetToken = await client.passwordResetToken.findUnique({
      where: {
        tokenHash,
      },
    });

    if (!passResetToken) {
      return null;
    }

    return PasswordResetToken.restore(passResetToken);
  }

  /** Отзывает все ещё не использованные и не отозванные токены пользователя. */
  async revokeActiveByUserId(userId: number, now: Date, ctx?: TransactionContext): Promise<void> {
    const client = this.getClient(ctx);
    await client.passwordResetToken.updateMany({
      where: {
        userId,
        expiresAt: {
          gt: now,
        },
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });
  }

  /** Помечает токен использованным и возвращает true, если запись была обновлена. */
  async markAsUsed(tokenId: string, usedAt: Date, ctx?: TransactionContext): Promise<boolean> {
    const client = this.getClient(ctx);
    const result = await client.passwordResetToken.updateMany({
      where: {
        id: tokenId,
        usedAt: null,
      },
      data: {
        usedAt,
      },
    });

    return result.count === 1;
  }

  async existsCreatedAfter(
    userId: number,
    cooldownStartedAt: Date,
    ctx?: TransactionContext,
  ): Promise<boolean> {
    const client = this.getClient(ctx);
    const result = await client.passwordResetToken.findFirst({
      where: { userId: userId, createdAt: { gt: cooldownStartedAt } },
      select: { id: true },
    });
    return !!result?.id;
  }
}
