import { Injectable } from '@nestjs/common';
import type { PaymentsTransactionContext } from '../../../payments/application/ports/payments-unit-of-work.js';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum.js';
import { BusinessAccessEvents } from '../ports/business-access-events.js';
import { SubscriptionsRepository } from '../ports/subscriptions.repository.js';

@Injectable()
export class RecordBusinessAccessService {
  constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly events: BusinessAccessEvents,
  ) {}

  /** Вызывать после изменений подписок, под lockByUserId и в той же транзакции. */
  async execute(userId: number, tx: PaymentsTransactionContext, now = new Date()): Promise<void> {
    const subscriptions = await this.subscriptionsRepository.findByUserId(userId, tx);
    const hasBusinessAccess = subscriptions.some(
      (subscription) =>
        (subscription.status === SubscriptionStatus.ACTIVE ||
          subscription.status === SubscriptionStatus.PENDING) &&
        subscription.startsAt <= now &&
        subscription.expiresAt > now,
    );

    // Снимок всего доступа: переход между двумя оплаченными подписками не отключает Business.
    await this.events.addSnapshot(userId, hasBusinessAccess, tx);
  }
}
