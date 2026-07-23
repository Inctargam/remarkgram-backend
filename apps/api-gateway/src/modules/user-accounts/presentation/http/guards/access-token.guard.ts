import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import type { RequestWithOptionalUserId } from '../auth-request.types.js';
import type { UnvalidatedJwtAccessPayload } from '../jwt-payload.types.js';

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

  /** Проверяет Bearer access-токен с аудиторией api и сохраняет claim sub как userId запроса. */
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
      // Проверяет подпись, алгоритм RS256, exp и aud. Generic задаёт тип, но не валидирует payload.
      const payload = await this.jwtService.verifyAsync<UnvalidatedJwtAccessPayload>(token, {
        audience: 'api',
      });

      // Claim sub связывает токен с текущим пользователем и передаётся дальше через request.
      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new UnauthorizedException('Missing or invalid sub JWT claim');
      }

      request.userId = payload.sub;
    } catch (error) {
      // verifyAsync() выбрасывает ошибки jsonwebtoken, а UnauthorizedException выше создаёт сам guard.
      // Публичный эндпоинт при любой из этих ошибок продолжает работу как анонимный.
      if (isPublic) {
        request.userId = null;
      } else if (error instanceof UnauthorizedException) {
        // Сохраняем конкретную ошибку об отсутствующем или некорректном sub.
        throw error;
      } else {
        // Формат, подпись, алгоритм, exp, nbf и aud клиенту различать не нужно: токен в любом случае
        // непригоден, поэтому возвращаем единый 401 для запуска refresh-flow или повторного входа.
        throw new UnauthorizedException('Invalid access token');
      }
    }

    return true;
  }
}
