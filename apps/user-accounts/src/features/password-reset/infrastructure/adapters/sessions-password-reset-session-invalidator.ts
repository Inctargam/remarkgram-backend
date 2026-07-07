import { Injectable } from '@nestjs/common';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';
import { SessionsService } from '../../../sessions/application/sessions.service.js';
import { PasswordResetSessionInvalidator } from '../../application/ports/password-reset-session-invalidator.js';

@Injectable()
export class SessionsPasswordResetSessionInvalidator extends PasswordResetSessionInvalidator {
  constructor(private readonly sessionsService: SessionsService) {
    super();
  }

  /** Удаляет все refresh-сессии пользователя после подтверждения сброса пароля. */
  async invalidateAllUserSessions(userId: number, ctx?: TransactionContext): Promise<void> {
    await this.sessionsService.revokeAllUserSessions(
      {
        userId: userId.toString(),
        reason: 'PASSWORD_CHANGED',
      },
      ctx,
    );
  }
}
