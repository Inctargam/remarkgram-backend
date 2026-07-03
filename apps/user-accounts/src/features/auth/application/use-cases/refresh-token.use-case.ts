import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SessionsService } from '../../../sessions/application/sessions.service.js';
import { AuthService } from '../../auth.service.js';
import type { JwtPair, RefreshTokenParams } from '../types/auth.types.js';

export class RefreshTokenCommand extends Command<JwtPair> {
  constructor(public readonly params: RefreshTokenParams) {
    super();
  }
}

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenUseCase implements ICommandHandler<RefreshTokenCommand> {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
  ) {}

  async execute(command: RefreshTokenCommand) {
    const { auth, deviceName, ip } = command.params;
    const { userId, sessionId, jti: currentJti } = auth;
    const { accessToken, refreshToken, refreshTokenPayload } = await this.authService.generateTokenPair({
      userId,
      sessionId,
    });

    await this.sessionsService.rotateRefreshToken({
      userId,
      sessionId,
      currentJti,
      newJti: refreshTokenPayload.jti,
      deviceName,
      ip,
      lastActiveAt: new Date(refreshTokenPayload.iat * 1000),
      expiresAt: new Date(refreshTokenPayload.exp * 1000),
    });

    return { accessToken, refreshToken };
  }
}
