import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'node:crypto';
import { SessionsService } from '../../../sessions/application/sessions.service.js';
import { AuthService } from '../auth.service.js';
import { EmailNotConfirmedError, UserAlreadyLoggedInError } from '../errors/auth.errors.js';
import type { JwtPair, LoginParams } from '../types/auth.types.js';

export class LoginCommand extends Command<JwtPair> {
  constructor(public readonly params: LoginParams) {
    super();
  }
}

@CommandHandler(LoginCommand)
export class LoginUseCase implements ICommandHandler<LoginCommand> {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
  ) {}

  async execute(command: LoginCommand) {
    const { email, password, currentSession, deviceName, ip } = command.params;
    if (currentSession && (await this.sessionsService.checkSession(currentSession))) {
      throw new UserAlreadyLoggedInError();
    }

    const user = await this.authService.validateCredentials(email, password);
    if (!user.confirmation.isConfirmed) {
      throw new EmailNotConfirmedError();
    }

    const sessionId = randomUUID();
    const userId = user.id.toString();
    const { accessToken, refreshToken, refreshTokenPayload } = await this.authService.generateTokenPair({
      userId,
      sessionId,
    });

    await this.sessionsService.createSession({
      userId,
      sessionId,
      deviceName,
      ip,
      jti: refreshTokenPayload.jti,
      lastActiveAt: new Date(refreshTokenPayload.iat * 1000),
      expiresAt: new Date(refreshTokenPayload.exp * 1000),
    });

    return { accessToken, refreshToken };
  }
}
