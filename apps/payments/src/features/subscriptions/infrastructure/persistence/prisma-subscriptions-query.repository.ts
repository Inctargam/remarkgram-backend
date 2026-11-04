import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service.js';
import { MultipleActiveSubscriptionsError } from '../../application/errors/multiple-active-subscriptions.error.js';
import { SubscriptionsQueryRepository } from '../../application/ports/subscriptions-query.repository.js';

@Injectable()
export class PrismaSubscriptionsQueryRepository extends SubscriptionsQueryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findUsersForStatusRefresh(before: Date, afterUserId?: number): Promise<number[]> {
    const users = await this.prisma.subscription.groupBy({
      by: ['userId'],
      where: {
        ...(afterUserId !== undefined && { userId: { gt: afterUserId } }),
        OR: [
          { status: { in: ['ACTIVE', 'PENDING'] }, expiresAt: { lte: before } },
          { status: 'PENDING', startsAt: { lte: before } },
        ],
      },
      orderBy: { userId: 'asc' },
      take: 100,
    });

    return users.map(({ userId }) => userId);
  }

  async hasActiveByUserId(userId: number): Promise<boolean> {
    const now = new Date();
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        userId,
        // Период PENDING-подписки мог уже начаться, пока фоновая задача ещё не обновила статус.
        // Условия по датам ниже исключают будущие и уже истёкшие периоды.
        status: { in: ['ACTIVE', 'PENDING'] },
        startsAt: { lte: now },
        expiresAt: { gt: now },
      },
      select: { id: true },
      take: 2,
    });

    if (subscriptions.length > 1) {
      throw new MultipleActiveSubscriptionsError(userId);
    }

    return subscriptions.length === 1;
  }
}
