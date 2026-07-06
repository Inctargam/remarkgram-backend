import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { NoActiveSessionError, SessionNotFoundError } from '../errors/sessions.errors.js';
import { SessionsService } from '../sessions.service.js';
import type { SessionIdentity } from '../types/sessions.types.js';

export type DeleteSessionParams = {
  auth: SessionIdentity;
  sessionId: string;
};

export class DeleteSessionCommand extends Command<void> {
  constructor(public readonly params: DeleteSessionParams) {
    super();
  }
}

@CommandHandler(DeleteSessionCommand)
export class DeleteSessionUseCase implements ICommandHandler<DeleteSessionCommand> {
  constructor(private readonly sessionsService: SessionsService) {}

  /** Удаляет выбранную сессию пользователя после проверки активности текущей сессии. */
  async execute(command: DeleteSessionCommand): Promise<void> {
    if (!(await this.sessionsService.checkSession(command.params.auth))) {
      throw new NoActiveSessionError();
    }

    const wasDeleted = await this.sessionsService.deleteUserSession(
      command.params.auth.userId,
      command.params.sessionId,
    );

    if (!wasDeleted) {
      throw new SessionNotFoundError();
    }
  }
}
