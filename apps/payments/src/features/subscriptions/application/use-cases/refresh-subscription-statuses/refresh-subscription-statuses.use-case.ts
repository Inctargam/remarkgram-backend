import { Injectable } from '@nestjs/common';
import type { PaymentsTransactionContext } from '../../../../payments/application/ports/payments-unit-of-work.js';
import { SubscriptionStatus } from '../../../domain/enums/subscription-status.enum.js';
import { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import { RecordBusinessAccessService } from '../../services/record-business-access.service.js';

@Injectable()
export class RefreshSubscriptionStatusesUseCase {
  constructor(
    private readonly subscriptions: SubscriptionsRepository,
    private readonly accessEvents: RecordBusinessAccessService,
  ) {}

  async execute(userId: number, tx: PaymentsTransactionContext): Promise<void> {
    // Та же блокировка, что у платежей: после ожидания состояние и время читаются заново.
    await this.subscriptions.lockByUserId(userId, tx);
    const subscriptions = await this.subscriptions.findByUserId(userId, tx);
    const now = new Date();

    const expiredIds = subscriptions
      .filter(
        (subscription) => subscription.status !== SubscriptionStatus.EXPIRED && subscription.expiresAt <= now,
      )
      .map((subscription) => subscription.subscriptionId);
    const activeIds = subscriptions
      .filter(
        (subscription) =>
          subscription.status === SubscriptionStatus.PENDING &&
          subscription.startsAt <= now &&
          subscription.expiresAt > now,
      )
      .map((subscription) => subscription.subscriptionId);

    if (expiredIds.length === 0 && activeIds.length === 0) return;

    // Сначала освобождаем единственный ACTIVE, затем активируем следующий оплаченный период.
    if (expiredIds.length > 0) await this.subscriptions.markExpired(expiredIds, tx);
    if (activeIds.length > 0) await this.subscriptions.markActive(activeIds, tx);

    // Один снимок после обоих переходов: между соседними периодами доступ не отключается.
    await this.accessEvents.execute(userId, tx, now);
  }
}
