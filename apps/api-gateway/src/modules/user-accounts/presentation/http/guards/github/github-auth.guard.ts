import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { OAuthIdentityClaims } from '@app/user-accounts-grpc';

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  handleRequest<TUser = OAuthIdentityClaims>(err: unknown, user: TUser | false | null, info: unknown): TUser {
    if (err instanceof Error) throw err;
    if (err) throw new UnauthorizedException('GitHub OAuth authentication failed');

    if (!user) {
      throw new UnauthorizedException(this.getAuthenticationErrorMessage(info));
    }

    return user;
  }

  private getAuthenticationErrorMessage(info: unknown): string {
    if (typeof info === 'object' && info !== null && 'message' in info && typeof info.message === 'string') {
      return info.message;
    }

    return 'GitHub OAuth authentication failed';
  }
}
