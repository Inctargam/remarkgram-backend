import { Injectable } from '@nestjs/common';
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
}
