import type { FindActiveSubscriptionResult } from '../../application/types/subscriptions.types.js';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service.js';
import { MultipleActiveSubscriptionsError } from '../../application/errors/multiple-active-subscriptions.error.js';
import { SubscriptionsQueryRepository } from '../../application/ports/subscriptions-query.repository.js';

@Injectable()
export class PrismaSubscriptionsQueryRepository extends SubscriptionsQueryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findActiveByUserId(userId: number): Promise<FindActiveSubscriptionResult | null> {
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

    const subscription = subscriptions[0];
    return subscription ? { subscriptionId: subscription.id } : null;
  }
}
