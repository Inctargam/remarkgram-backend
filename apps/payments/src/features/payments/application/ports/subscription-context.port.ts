export type ActiveSubscriptionForPurchase = {
  subscriptionId: string;
};

/**
 * Граница чтения контекста подписки.
 * Реализация принадлежит Subscription Module и не раскрывает Payments его внутреннюю модель.
 */
export abstract class SubscriptionContextPort {
  /**
   * Ищет активную локальную Subscription пользователя перед созданием Payment.
   *
   * null означает, что активной Subscription нет и покупка является кандидатом
   * на создание первой Subscription. Ненулевой результат содержит идентификатор
   * существующей активной Subscription. D1 использует факт её наличия, чтобы
   * отличить первую покупку от дополнительной, и сохраняет локальную связь как
   * targetSubscriptionId. Порядок и фактическую Subscription определяет D2 после
   * подтверждения оплаты.
   *
   * Метод только читает состояние Subscription Module. Его результат сам по себе
   * не защищает от гонки: право создать первую подписку должно резервироваться
   * атомарно при создании Payment внутри Payments Module.
   */
  abstract findActiveSubscriptionForPurchase(userId: number): Promise<ActiveSubscriptionForPurchase | null>;
}
