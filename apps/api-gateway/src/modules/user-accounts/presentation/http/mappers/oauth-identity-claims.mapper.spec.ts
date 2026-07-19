import { UnauthorizedException } from '@nestjs/common';
import { OAuthProvider } from '@app/user-accounts-grpc';
import { normalizeGithubIdentityClaims, validateOAuthEmails } from './oauth-identity-claims.mapper.js';

describe('OAuth identity claims mapper', () => {
  it('validates provider emails without changing their representation', () => {
    expect(validateOAuthEmails([{ email: ' User@Example.COM ', verified: true, primary: true }])).toEqual([
      { email: ' User@Example.COM ', verified: true, primary: true },
    ]);
  });

  it('rejects duplicate emails after normalization', () => {
    expect(() =>
      validateOAuthEmails([
        { email: 'user@example.com', verified: true, primary: true },
        { email: ' USER@example.com ', verified: true, primary: false },
      ]),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a non-GitHub identity on the GitHub callback', () => {
    expect(() =>
      normalizeGithubIdentityClaims({
        provider: OAuthProvider.OAUTH_PROVIDER_GOOGLE,
        subject: 'google-subject',
        emails: [],
        username: '',
        avatarUrl: '',
      }),
    ).toThrow(UnauthorizedException);
  });
});
