import type { PaymentsTransactionContext } from '../../../payments/application/ports/payments-unit-of-work.js';

export abstract class BusinessAccessEvents {
  /** Сохраняет снимок доступа в переданной транзакции под общей блокировкой пользователя. */
  abstract addSnapshot(
    userId: number,
    hasBusinessAccess: boolean,
    tx: PaymentsTransactionContext,
  ): Promise<void>;
}
