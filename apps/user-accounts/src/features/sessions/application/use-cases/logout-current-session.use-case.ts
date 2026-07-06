import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SessionsService } from '../sessions.service.js';
import type { SessionIdentity } from '../types/sessions.types.js';

export class LogoutCurrentSessionCommand extends Command<void> {
  constructor(public readonly auth: SessionIdentity) {
    super();
  }
}

@CommandHandler(LogoutCurrentSessionCommand)
export class LogoutCurrentSessionUseCase implements ICommandHandler<LogoutCurrentSessionCommand> {
  constructor(private readonly sessionsService: SessionsService) {}

  /** Выполняет идемпотентный hard delete текущей refresh-сессии пользователя. */
  async execute(command: LogoutCurrentSessionCommand): Promise<void> {
    await this.sessionsService.deleteCurrentSession(command.auth);
  }
}
