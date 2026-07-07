import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service.js';
import { SessionsQueryRepository } from '../../application/ports/sessions-query.repository.js';
import type { SessionView } from '../../application/types/sessions.types.js';

@Injectable()
export class PrismaSessionsQueryRepository implements SessionsQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveSessions(userId: string): Promise<SessionView[]> {
    const numericUserId = Number(userId);
    if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
      return [];
    }

    const sessions = await this.prisma.deviceSession.findMany({
      where: {
        userId: numericUserId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return sessions.map((session) => ({
      ip: session.ip,
      deviceName: session.deviceName,
      lastActiveAt: session.lastActiveAt,
      sessionId: session.id,
    }));
  }
}
