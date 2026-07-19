import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  handleRequest<OAuthIdentityClaims>(
    err: any,
    user: OAuthIdentityClaims,
    info: any,
    context: ExecutionContext,
    status: any,
  ) {
    // 1. Обработка ошибки от GitHub или вашей стратегии (например, отказано в доступе)
    if (err || !user) {
      // Логируйте ошибку для отладки
      console.error('GitHub Auth Error:', err || info);

      return null;
      // 2. Возврат кастомной ошибки или редирект (в зависимости от ваших нужд)
      // throw new UnauthorizedException('Не удалось авторизоваться через GitHub');
      //
      // // Для перенаправления на фронтенд при веб-ошибке:
      // const res = context.switchToHttp().getResponse();
      // return res.redirect('http://localhost:3000/login/failure');
    }

    // 3. Если всё успешно, возвращаем пользователя
    return user;
  }
}
