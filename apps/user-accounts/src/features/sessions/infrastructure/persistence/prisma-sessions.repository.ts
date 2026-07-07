import { Injectable } from '@nestjs/common';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';
import type { Prisma } from '../../../../database/generated/client.js';
import { PrismaService } from '../../../../database/prisma.service.js';
import { InvalidUserIdError } from '../../application/errors/sessions.errors.js';
import { SessionsRepository } from '../../application/ports/sessions.repository.js';
import type {
  CreateSessionParams,
  RevokeAllSessionsParams,
  RevokeCurrentSessionParams,
  RevokeOtherSessionsParams,
  RevokeSessionParams,
  RotateRefreshTokenParams,
  SessionIdentity,
  SessionRevokedReason,
} from '../../application/types/sessions.types.js';

@Injectable()
export class PrismaSessionsRepository implements SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private parseUserId(raw: string): number {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) throw new InvalidUserIdError();
    return id;
  }

  private getClient(ctx?: TransactionContext): PrismaService | Prisma.TransactionClient {
    return (ctx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  private buildRevocationData(reason: SessionRevokedReason) {
    return {
      revokedAt: new Date(),
      revokedReason: reason,
    };
  }

  /** Проверяет, что refresh-сессия активна: существует, не отозвана, не истекла и содержит текущий jti. */
  async isSessionActive(params: SessionIdentity): Promise<boolean> {
    const userId = this.parseUserId(params.userId);

    const session = await this.prisma.deviceSession.findFirst({
      select: { id: true },
      where: {
        id: params.sessionId,
        userId,
        jti: params.jti,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return session !== null;
  }

  /** Возвращает владельца активной сессии; отозванные сессии считаются недоступными. */
  async getSessionOwner(sessionId: string): Promise<string | null> {
    const session = await this.prisma.deviceSession.findUnique({
      select: { userId: true },
      where: { id: sessionId, revokedAt: null },
    });

    return session?.userId.toString() ?? null;
  }

  /** Сохраняет новую login-сессию с jti refresh-токена, который будет использован при первой ротации. */
  async createSession(params: CreateSessionParams): Promise<void> {
    const userId = this.parseUserId(params.userId);

    await this.prisma.deviceSession.create({
      data: {
        id: params.sessionId,
        userId,
        deviceName: params.deviceName,
        ip: params.ip,
        jti: params.jti,
        lastActiveAt: params.lastActiveAt,
        expiresAt: params.expiresAt,
      },
    });
  }

  /**
   * Атомарно заменяет jti refresh-токена для активной сессии.
   * Если строка не обновилась, запрос может быть повторным использованием старого токена,
   * поэтому активная сессия с другим jti отзывается как скомпрометированная.
   */
  async rotateRefreshToken(params: RotateRefreshTokenParams): Promise<boolean> {
    const userId = this.parseUserId(params.userId);

    const result = await this.prisma.deviceSession.updateMany({
      where: {
        id: params.sessionId,
        userId,
        jti: params.currentJti,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        jti: params.newJti,
        deviceName: params.deviceName,
        ip: params.ip,
        lastActiveAt: params.lastActiveAt,
        expiresAt: params.expiresAt,
      },
    });

    if (result.count === 1) {
      return true;
    }

    await this.revokeReusedRefreshTokenSession(params);
    return false;
  }

  /**
   * Отзывает текущую сессию по данным из проверенного refresh-токена.
   * Проверка jti обязательна: она не позволяет выполнить logout старым refresh-токеном после ротации.
   */
  async revokeCurrentSession(params: RevokeCurrentSessionParams): Promise<boolean> {
    const userId = this.parseUserId(params.userId);

    const result = await this.prisma.deviceSession.updateMany({
      where: {
        id: params.sessionId,
        userId,
        jti: params.jti,
        revokedAt: null,
      },
      data: this.buildRevocationData(params.reason),
    });

    return result.count === 1;
  }

  /**
   * Отзывает выбранную активную сессию пользователя без проверки jti.
   * Используется для удаления устройства из списка: у текущего клиента нет refresh-токена выбранной сессии.
   */
  async revokeUserSession(params: RevokeSessionParams): Promise<boolean> {
    const userId = this.parseUserId(params.userId);

    const result = await this.prisma.deviceSession.updateMany({
      where: {
        id: params.sessionId,
        userId,
        revokedAt: null,
      },
      data: this.buildRevocationData(params.reason),
    });

    return result.count === 1;
  }

  /** Отзывает все активные сессии пользователя, кроме текущей, например для logout на других устройствах. */
  async revokeOtherUserSessions(params: RevokeOtherSessionsParams): Promise<number> {
    const userId = this.parseUserId(params.userId);

    const result = await this.prisma.deviceSession.updateMany({
      where: {
        userId,
        id: { not: params.currentSessionId },
        revokedAt: null,
      },
      data: this.buildRevocationData(params.reason),
    });

    return result.count;
  }

  /** Отзывает все активные сессии пользователя, при необходимости внутри транзакции вызывающего кода. */
  async revokeAllUserSessions(params: RevokeAllSessionsParams, ctx?: TransactionContext): Promise<number> {
    const userId = this.parseUserId(params.userId);

    const result = await this.getClient(ctx).deviceSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: this.buildRevocationData(params.reason),
    });

    return result.count;
  }

  /** Помечает активную сессию как скомпрометированную, если при ротации пришел старый jti этой сессии. */
  private async revokeReusedRefreshTokenSession(params: RotateRefreshTokenParams): Promise<void> {
    const userId = this.parseUserId(params.userId);

    await this.prisma.deviceSession.updateMany({
      where: {
        id: params.sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        NOT: { jti: params.currentJti },
      },
      data: this.buildRevocationData('TOKEN_REUSE_DETECTED'),
    });
  }
}
