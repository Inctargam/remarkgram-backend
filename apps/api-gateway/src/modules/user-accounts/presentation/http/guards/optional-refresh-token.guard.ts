import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { VerifiedRefreshTokenClaims } from '@app/user-accounts-grpc';
import type { RequestWithOptionalRefreshSession } from '../auth-request.types.js';

type JwtRefreshPayload = {
  sub?: unknown;
  sessionId?: unknown;
  jti?: unknown;
};

/**
 * Обрабатывает необязательный refresh-токен при входе в систему.
 * Валидный токен передаётся в user-accounts для проверки активной сессии, а отсутствие или ошибка токена
 * не блокируют повторную аутентификацию по логину и паролю.
 */
@Injectable()
export class OptionalRefreshTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  /** Проверяет необязательный refresh-токен и добавляет claims только при успешной проверке подписи. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithOptionalRefreshSession>();
    const refreshToken = request.cookies.refreshToken;

    if (!refreshToken) {
      return true;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtRefreshPayload>(refreshToken);
      request.refreshTokenClaims = this.toVerifiedClaims(payload);
    } catch {
      return true;
    }

    return true;
  }

  /** Проверяет обязательные claims и преобразует JWT payload в транспортный объект для gRPC. */
  private toVerifiedClaims(payload: JwtRefreshPayload): VerifiedRefreshTokenClaims {
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.sessionId !== 'string' ||
      !payload.sessionId ||
      typeof payload.jti !== 'string' ||
      !payload.jti
    ) {
      throw new Error('Invalid refresh token payload');
    }

    return {
      userId: payload.sub,
      sessionId: payload.sessionId,
      jti: payload.jti,
    };
  }
}
