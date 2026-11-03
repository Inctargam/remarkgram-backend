export abstract class SubscriptionsQueryRepository {
  /**
   * Ищет ACTIVE/PENDING с startsAt <= now < expiresAt, включая задержку смены статуса.
   * Только чтение. false — подписки нет; ошибка чтения или несколько совпадений — ошибка.
   */
  abstract hasActiveByUserId(userId: number): Promise<boolean>;

  /** Кандидаты на смену статусов: до 100 разных пользователей после курсора. */
  abstract findUsersForStatusRefresh(before: Date, afterUserId?: number): Promise<number[]>;
}
