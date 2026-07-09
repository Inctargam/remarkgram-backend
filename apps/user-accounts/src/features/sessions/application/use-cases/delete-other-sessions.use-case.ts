import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { NoActiveSessionError } from '../errors/sessions.errors.js';
import { SessionsService } from '../sessions.service.js';
import type { SessionIdentity } from '../types/sessions.types.js';

export class DeleteOtherSessionsCommand extends Command<void> {
  constructor(public readonly auth: SessionIdentity) {
    super();
  }
}

@CommandHandler(DeleteOtherSessionsCommand)
export class DeleteOtherSessionsUseCase implements ICommandHandler<DeleteOtherSessionsCommand> {
  constructor(private readonly sessionsService: SessionsService) {}

  /** Отзывает все сессии пользователя, кроме текущей активной refresh-сессии. */
  async execute(command: DeleteOtherSessionsCommand): Promise<void> {
    if (!(await this.sessionsService.checkSession(command.auth))) {
      throw new NoActiveSessionError();
    }

    await this.sessionsService.revokeOtherUserSessions({
      userId: command.auth.userId,
      currentSessionId: command.auth.sessionId,
      reason: 'LOGOUT_ALL',
    });
  }
}
