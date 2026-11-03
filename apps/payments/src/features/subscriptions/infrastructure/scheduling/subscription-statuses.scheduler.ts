import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../database/prisma.service.js';
import { SubscriptionsQueryRepository } from '../../application/ports/subscriptions-query.repository.js';
import { RefreshSubscriptionStatusesUseCase } from '../../application/use-cases/refresh-subscription-statuses/refresh-subscription-statuses.use-case.js';

@Injectable()
export class SubscriptionStatusesScheduler {
  private readonly logger = new Logger(SubscriptionStatusesScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsQueryRepository,
    private readonly refreshStatuses: RefreshSubscriptionStatusesUseCase,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async handle(): Promise<void> {
    const before = new Date();
    let afterUserId: number | undefined;

    try {
      while (true) {
        const userIds = await this.subscriptions.findUsersForStatusRefresh(before, afterUserId);
        if (userIds.length === 0) return;

        for (const userId of userIds) {
          try {
            await this.prisma.$transaction((tx) => this.refreshStatuses.execute(userId, tx));
          } catch {
            // Следующий проход снова найдёт пользователя: изменения и событие откатились вместе.
            this.logger.error(`Subscription status refresh failed; userId=${userId}`);
          }
        }

        afterUserId = userIds[userIds.length - 1];
      }
    } catch {
      this.logger.error('Subscription status scan failed');
    }
  }
}
