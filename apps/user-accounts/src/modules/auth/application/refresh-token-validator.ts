import { Injectable } from '@nestjs/common';
import { SessionsService } from '../../sessions/application/sessions.service.js';
import { AuthService } from '../auth.service.js';
import type { JwtRefreshPayload } from './types/auth.types.js';

@Injectable()
export class RefreshTokenValidator {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
  ) {}

  async validate(refreshToken: string): Promise<JwtRefreshPayload> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.authService.verifyRefreshToken(refreshToken);
    } catch {
      throw new Error('Invalid refresh token');
    }

    if (!(await this.sessionsService.checkSession(payload.jti, payload.sessionId))) {
      throw new Error('No active session found');
    }

    return payload;
  }

  async isActive(refreshToken: string | undefined): Promise<boolean> {
    if (!refreshToken) return false;

    let payload: JwtRefreshPayload;
    try {
      payload = await this.authService.verifyRefreshToken(refreshToken);
    } catch {
      return false;
    }

    return this.sessionsService.checkSession(payload.jti, payload.sessionId);
  }
}
