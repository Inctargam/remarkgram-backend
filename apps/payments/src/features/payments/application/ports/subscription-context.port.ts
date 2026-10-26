/**
 * Граница чтения контекста подписки.
 * Реализация принадлежит Subscription Module и не раскрывает Payments его внутреннюю модель.
 */
export abstract class SubscriptionContextPort {
  /**
   * Ищет активную локальную Subscription пользователя перед созданием Payment.
   *
   * true означает, что активная Subscription есть и покупка является
   * дополнительной; false — что покупка является кандидатом на создание первой
   * Subscription. Идентификатор и фактическую Subscription D2 определяет после
   * подтверждения оплаты.
   *
   * Метод только читает состояние Subscription Module. Его результат сам по себе
   * не защищает от гонки: право создать первую подписку должно резервироваться
   * атомарно при создании Payment внутри Payments Module.
   */
  abstract hasActiveSubscription(userId: number): Promise<boolean>;
}
