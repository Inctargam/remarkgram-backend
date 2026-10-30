import type { PaymentsTransactionContext } from '../../../payments/application/ports/payments-unit-of-work.js';
import type {
  BindProviderSubscriptionRepositoryParams,
  CreateSubscriptionRepositoryParams,
  RenewSubscriptionRepositoryParams,
  SetSubscriptionAutoRenewalRepositoryParams,
  SubscriptionPaymentApplication,
  SubscriptionForPayment,
} from '../types/subscriptions.types.js';

export abstract class SubscriptionsRepository {
  /**
   * Сериализует изменения подписок пользователя, даже если подписок ещё нет.
   * Вызывать до чтения состояния в переданной транзакции с уровнем ReadCommitted.
   * Блокировка удерживается до commit/rollback; внешние API внутри неё не вызываются.
   */
  abstract lockByUserId(userId: number, tx: PaymentsTransactionContext): Promise<void>;

  /** Атомарно сохраняет RETIRED старой связи и BINDING_PENDING операции через переданный tx. */
  abstract confirmAutoRenewalCancellation(operationId: string, tx: PaymentsTransactionContext): Promise<void>;

  /** Сохраняет привязку и её снимок, ENABLED подписки и COMPLETED операции, не меняя даты доступа. */
  abstract bindProviderSubscription(
    params: BindProviderSubscriptionRepositoryParams,
    tx: PaymentsTransactionContext,
  ): Promise<void>;

  /** До блокировки используется только userId; решения принимаются после повторного чтения под блокировкой. */
  abstract findPaymentApplication(
    paymentId: string,
    tx: PaymentsTransactionContext,
  ): Promise<SubscriptionPaymentApplication | null>;

  abstract findByUserId(userId: number, tx: PaymentsTransactionContext): Promise<SubscriptionForPayment[]>;

  abstract markExpired(subscriptionIds: string[], tx: PaymentsTransactionContext): Promise<void>;

  abstract setAutoRenewalState(
    params: SetSubscriptionAutoRenewalRepositoryParams,
    tx: PaymentsTransactionContext,
  ): Promise<void>;

  /** Сохраняет подписку, применение платежа и необходимую операцию автопродления в переданном tx. */
  abstract createWithPaymentApplication(
    params: CreateSubscriptionRepositoryParams,
    tx: PaymentsTransactionContext,
  ): Promise<void>;

  /** Продлевает существующую строку и сохраняет неизменяемый результат платежа. */
  abstract renewWithPaymentApplication(
    params: RenewSubscriptionRepositoryParams,
    tx: PaymentsTransactionContext,
  ): Promise<void>;
}
