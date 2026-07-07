import { Injectable } from '@nestjs/common';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';
import type { Prisma } from '../../../../database/generated/client.js';
import { PrismaService } from '../../../../database/prisma.service.js';
import { InvalidUserIdError } from '../../application/errors/sessions.errors.js';
import { SessionsRepository } from '../../application/ports/sessions.repository.js';
import type {
  CreateSessionParams,
  RotateRefreshTokenParams,
  SessionIdentity,
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

  async isSessionActive(params: SessionIdentity): Promise<boolean> {
    const userId = this.parseUserId(params.userId);

    const session = await this.prisma.deviceSession.findFirst({
      select: { id: true },
      where: { id: params.sessionId, userId, jti: params.jti },
    });

    return session !== null;
  }

  async getSessionOwner(sessionId: string): Promise<string | null> {
    const session = await this.prisma.deviceSession.findUnique({
      select: { userId: true },
      where: { id: sessionId },
    });

    return session?.userId.toString() ?? null;
  }

  /**
   * Создаёт login-сессию, только если пароль не изменился после проверки credentials.
   *
   * INSERT получает источник из users по id и ожидаемому hash. Если пользователь удалён или password reset
   * уже изменил hash, SELECT вернёт ноль строк, INSERT ничего не создаст, а метод вернёт false.
   *
   * FOR NO KEY UPDATE блокирует найденную строку User до завершения statement и конфликтует с UPDATE hash
   * и DELETE. Если login захватил блокировку первым, password reset дождётся INSERT, после чего изменит пароль
   * и удалит созданную сессию. Если reset был первым, login увидит новый hash и не выполнит INSERT.
   * Проверка ожидаемого состояния, блокировка и создание сессии намеренно объединены в один SQL statement,
   * чтобы между ними не оставалось TOCTOU-окна.
   */
  async createSession(params: CreateSessionParams): Promise<boolean> {
    const userId = this.parseUserId(params.userId);

    const insertedCount = await this.prisma.$executeRaw`
      INSERT INTO "device_sessions" (
        "id",
        "userId",
        "deviceName",
        "ip",
        "jti",
        "lastActiveAt",
        "expiresAt"
      )
      SELECT
        ${params.sessionId}::uuid,
        u."id",
        ${params.deviceName},
        ${params.ip},
        ${params.jti},
        ${params.lastActiveAt},
        ${params.expiresAt}
      FROM "users" AS u
      WHERE u."id" = ${userId}
        AND u."hash" = ${params.expectedPasswordHash}
        AND u."deletedAt" IS NULL
      FOR NO KEY UPDATE
    `;

    return insertedCount === 1;
  }

  async rotateRefreshToken(params: RotateRefreshTokenParams): Promise<boolean> {
    const userId = this.parseUserId(params.userId);

    const result = await this.prisma.deviceSession.updateMany({
      where: {
        id: params.sessionId,
        userId,
        jti: params.currentJti,
      },
      data: {
        jti: params.newJti,
        deviceName: params.deviceName,
        ip: params.ip,
        lastActiveAt: params.lastActiveAt,
        expiresAt: params.expiresAt,
      },
    });

    return result.count === 1;
  }

  async deleteCurrentSession(params: SessionIdentity): Promise<boolean> {
    const userId = this.parseUserId(params.userId);

    const result = await this.prisma.deviceSession.deleteMany({
      where: {
        id: params.sessionId,
        userId,
        jti: params.jti,
      },
    });

    return result.count === 1;
  }

  async deleteUserSession(userId: string, sessionId: string): Promise<boolean> {
    const numericUserId = this.parseUserId(userId);

    const result = await this.prisma.deviceSession.deleteMany({
      where: {
        id: sessionId,
        userId: numericUserId,
      },
    });

    return result.count === 1;
  }

  async deleteOtherUserSessions(userId: string, currentSessionId: string): Promise<number> {
    const numericUserId = this.parseUserId(userId);

    const result = await this.prisma.deviceSession.deleteMany({
      where: {
        userId: numericUserId,
        id: { not: currentSessionId },
      },
    });

    return result.count;
  }

  async deleteAllUserSessions(userId: string, ctx?: TransactionContext): Promise<number> {
    const numericUserId = this.parseUserId(userId);

    const result = await this.getClient(ctx).deviceSession.deleteMany({
      where: {
        userId: numericUserId,
      },
    });

    return result.count;
  }
}
