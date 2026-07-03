import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import type { RequestWithOptionalUserId } from '../auth-request.types.js';

/**
 * Защищает HTTP-эндпоинты, требующие access-токен, и добавляет идентификатор пользователя в request.
 * Эндпоинты с декоратором Public пропускаются без обязательной аутентификации.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  /** Проверяет Bearer access-токен и сохраняет claim sub как userId текущего запроса. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithOptionalUserId>();
    const isPublic = this.reflector.getAllAndOverride(Public, [context.getHandler(), context.getClass()]);
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      if (isPublic) {
        request.userId = null;
        return true;
      }
      throw new UnauthorizedException('Authorization header missing');
    }

    const [method, token] = authHeader.split(' ');
    if (method !== 'Bearer' || !token) {
      if (isPublic) {
        request.userId = null;
        return true;
      }
      throw new UnauthorizedException('Invalid authorization method');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: string }>(token);
      if (!payload.sub) {
        throw new UnauthorizedException('Missing sub JWT claim');
      }
      request.userId = payload.sub;
    } catch (error) {
      if (isPublic) {
        request.userId = null;
      } else if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new UnauthorizedException('Invalid access token');
      }
    }

    return true;
  }
}
