import type { FindActiveSubscriptionResult } from '../types/subscriptions.types.js';

export abstract class SubscriptionsQueryRepository {
  /**
   * Ищет ACTIVE/PENDING с startsAt <= now < expiresAt, включая задержку смены статуса.
   * Только чтение. null — подписки нет; ошибка чтения или несколько совпадений — ошибка.
   */
  abstract findActiveByUserId(userId: number): Promise<FindActiveSubscriptionResult | null>;
}
