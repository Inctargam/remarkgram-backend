import type { TransactionContext } from '../../../../common/application/unit-of-work.js';

export abstract class PasswordResetSessionInvalidator {
  /** Инвалидирует все активные пользовательские сессии после успешного сброса пароля. */
  abstract invalidateAllUserSessions(userId: number, ctx?: TransactionContext): Promise<void>;
}
