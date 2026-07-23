import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { VerifiedRefreshTokenClaims } from '@app/user-accounts-grpc';
import type { RequestWithOptionalRefreshSession } from '../auth-request.types.js';
import type { UnvalidatedJwtRefreshPayload } from '../jwt-payload.types.js';

/**
 * Защищает эндпоинты, для которых refresh-токен является обязательным способом аутентификации.
 * Gateway проверяет подпись токена и передаёт доверенные claims в user-accounts.
 */
@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  /** Проверяет наличие, подпись и аудиторию auth refresh-токена, затем сохраняет его claims в request. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithOptionalRefreshSession>();
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid authorization method');
    }

    try {
      const payload = await this.jwtService.verifyAsync<UnvalidatedJwtRefreshPayload>(refreshToken, {
        audience: 'auth',
      });
      request.refreshTokenClaims = this.toVerifiedClaims(payload);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /** Проверяет обязательные claims и преобразует JWT payload в транспортный объект для gRPC. */
  private toVerifiedClaims(payload: UnvalidatedJwtRefreshPayload): VerifiedRefreshTokenClaims {
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.sessionId !== 'string' ||
      !payload.sessionId ||
      typeof payload.jti !== 'string' ||
      !payload.jti
    ) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    return {
      userId: payload.sub,
      sessionId: payload.sessionId,
      jti: payload.jti,
    };
  }
}
