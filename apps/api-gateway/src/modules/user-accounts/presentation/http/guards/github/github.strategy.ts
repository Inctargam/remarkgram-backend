import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-github2';
import type { ConfigType } from '@nestjs/config';
import { githubOauthConfig } from '../../../../config/github-oauth.config.ts';
import { OAuthProvider, type OAuthIdentityClaims } from '@app/user-accounts-grpc';

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string;
}

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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  async validate(accessToken: string, refreshToken: string, profile: Profile): Promise<OAuthIdentityClaims> {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'your-application-name',
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new UnauthorizedException(`GitHub emails request failed: ${response.status} ${body}`);
    }

    const emails = (await response.json()) as GitHubEmail[];

    return {
      provider: OAuthProvider.OAUTH_PROVIDER_GITHUB,
      emails: emails.map(({ email, verified, primary }) => ({ email, verified, primary })),
      subject: profile.id.toString(),
      avatarUrl: profile.photos?.find((p) => !!p.value)?.value ?? '',
      username: profile.username ?? profile.displayName ?? '',
    };
  }
}
