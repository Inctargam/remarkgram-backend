import { UnauthorizedException } from '@nestjs/common';
import { OAuthProvider } from '@app/user-accounts-grpc';
import {
  normalizeGithubIdentityClaims,
  normalizeGoogleIdentityClaims,
  validateOAuthEmails,
} from './oauth-identity-claims.mapper.js';

describe('OAuth identity claims mapper', () => {
  it('validates GitHub emails without changing their representation', () => {
    expect(validateOAuthEmails([{ email: ' User@Example.COM ', verified: true, primary: true }])).toEqual([
      { email: ' User@Example.COM ', verified: true, primary: true },
    ]);
  });

  it('rejects duplicate GitHub emails after normalization', () => {
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

  it('maps validated Google ID token claims to an OAuth identity', () => {
    expect(
      normalizeGoogleIdentityClaims({
        sub: ' google-subject ',
        email: 'user@example.com',
        email_verified: true,
        name: ' User ',
        picture: 'https://example.com/avatar.png',
      }),
    ).toEqual({
      provider: OAuthProvider.OAUTH_PROVIDER_GOOGLE,
      subject: 'google-subject',
      emails: [{ email: 'user@example.com', verified: true, primary: true }],
      username: 'User',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });

  it('rejects Google claims without a verified-status field', () => {
    expect(() =>
      normalizeGoogleIdentityClaims({
        sub: 'google-subject',
        email: 'user@example.com',
      }),
    ).toThrow(UnauthorizedException);
  });
});
