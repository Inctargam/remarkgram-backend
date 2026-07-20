import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-github2';
import type { ConfigType } from '@nestjs/config';
import { githubOauthConfig } from '../../../../config/github-oauth.config.ts';
import { OAuthProvider, type OAuthIdentityClaims } from '@app/user-accounts-grpc';
import { validateOAuthEmails } from '../../mappers/oauth-identity-claims.mapper.js';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  logger = new Logger(GithubStrategy.name);
  constructor(@Inject(githubOauthConfig.KEY) private readonly config: ConfigType<typeof githubOauthConfig>) {
    super({
      clientID: config.clientID,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
      // Нужен для GET /user/emails
      scope: ['read:user', 'user:email'],
    });
  }
  async validate(accessToken: string, refreshToken: string, profile: Profile): Promise<OAuthIdentityClaims> {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': this.config.apiVersion,
        'User-Agent': this.config.userAgent,
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new UnauthorizedException(`GitHub emails request failed: ${response.status} ${body}`);
    }

    const emails = validateOAuthEmails(await response.json());

    return {
      provider: OAuthProvider.OAUTH_PROVIDER_GITHUB,
      emails,
      subject: profile.id.toString(),
      avatarUrl: profile.photos?.find((p) => !!p.value)?.value ?? '',
      username: profile.username ?? profile.displayName ?? '',
    };
  }
}
