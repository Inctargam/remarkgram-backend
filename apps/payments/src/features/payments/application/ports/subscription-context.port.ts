export type SubscriptionPurchaseContext =
  | {
      kind: 'FIRST_PURCHASE';
    }
  | {
      kind: 'ADDITIONAL_PURCHASE';
      subscriptionId: string;
    };

/**
 * Граница чтения контекста подписки.
 * Реализация принадлежит Subscription Module и не раскрывает Payments его внутреннюю модель.
 */
export abstract class SubscriptionContextPort {
  /**
   * Возвращает контекст покупки подписки для пользователя.
   *
   * FIRST_PURCHASE означает, что локальная подписка ещё не создана.
   * ADDITIONAL_PURCHASE содержит идентификатор существующей подписки,
   * к которой после успешной оплаты должен быть применён купленный период.
   *
   * Метод только читает состояние Subscription Module. Его результат сам по себе
   * не защищает от гонки: право создать первую подписку должно резервироваться
   * атомарно при создании Payment внутри Payments Module.
   */
  abstract getPurchaseContext(userId: number): Promise<SubscriptionPurchaseContext>;
}
