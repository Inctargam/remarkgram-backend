import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SessionsService } from '../../../sessions/application/sessions.service.js';
import { AuthService } from '../../auth.service.js';
import { RefreshTokenValidator } from '../refresh-token-validator.js';
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
    private readonly refreshTokenValidator: RefreshTokenValidator,
  ) {}

  async execute(command: RefreshTokenCommand) {
    const { refreshToken: currentRefreshToken, deviceName, ip } = command.params;
    const payload = await this.refreshTokenValidator.validate(currentRefreshToken);
    const userId = payload.sub;
    const sessionId = payload.sessionId;
    const currentJti = payload.jti;
    const { accessToken, refreshToken, refreshTokenPayload } = await this.authService.generateTokenPair({
      userId,
      sessionId,
    });

    await this.sessionsService.rotateRefreshToken({
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
