import { UnauthorizedException } from '@nestjs/common';
import { type OAuthEmail, type OAuthIdentityClaims, OAuthProvider } from '@app/user-accounts-grpc';

// TODO: Если Google mapper будет формировать OAuthEmail[] напрямую, переименовать функцию
// в validateGithubEmails: фактически она проверяет сырой ответ GitHub GET /user/emails.
export function validateOAuthEmails(value: unknown): OAuthEmail[] {
  if (!Array.isArray(value)) {
    throw new UnauthorizedException('OAuth provider returned an invalid email list');
  }

  const emails: OAuthEmail[] = [];
  const uniqueEmails = new Set<string>();

  for (const item of value) {
    if (!isOAuthEmail(item)) {
      throw new UnauthorizedException('OAuth provider returned invalid email data');
    }

    const comparisonKey = item.email.trim().toLowerCase();
    if (!comparisonKey || uniqueEmails.has(comparisonKey)) {
      throw new UnauthorizedException('OAuth provider returned duplicate or empty email data');
    }

    uniqueEmails.add(comparisonKey);
    emails.push({ email: item.email, verified: item.verified, primary: item.primary });
  }

  return emails;
}

export function normalizeGithubIdentityClaims(identity: OAuthIdentityClaims | null): OAuthIdentityClaims {
  if (
    !identity ||
    identity.provider !== OAuthProvider.OAUTH_PROVIDER_GITHUB ||
    typeof identity.subject !== 'string' ||
    !identity.subject.trim()
  ) {
    throw new UnauthorizedException('Invalid GitHub OAuth identity');
  }

  return {
    provider: OAuthProvider.OAUTH_PROVIDER_GITHUB,
    subject: identity.subject.trim(),
    emails: validateOAuthEmails(identity.emails),
    username: typeof identity.username === 'string' ? identity.username.trim() : '',
    avatarUrl: typeof identity.avatarUrl === 'string' ? identity.avatarUrl : '',
  };
}

export function normalizeGoogleIdentityClaims(claims: unknown): OAuthIdentityClaims {
  if (
    typeof claims !== 'object' ||
    claims === null ||
    !('sub' in claims) ||
    typeof claims.sub !== 'string' ||
    !claims.sub.trim() ||
    !('email' in claims) ||
    typeof claims.email !== 'string' ||
    !('email_verified' in claims) ||
    typeof claims.email_verified !== 'boolean'
  ) {
    throw new UnauthorizedException('Invalid Google OIDC identity');
  }

  return {
    provider: OAuthProvider.OAUTH_PROVIDER_GOOGLE,
    subject: claims.sub.trim(),
    emails: validateOAuthEmails([{ email: claims.email, verified: claims.email_verified, primary: true }]),
    username: 'name' in claims && typeof claims.name === 'string' ? claims.name.trim() : '',
    avatarUrl: 'picture' in claims && typeof claims.picture === 'string' ? claims.picture : '',
  };
}

function isOAuthEmail(value: unknown): value is OAuthEmail {
  return (
    typeof value === 'object' &&
    value !== null &&
    'email' in value &&
    typeof value.email === 'string' &&
    'verified' in value &&
    typeof value.verified === 'boolean' &&
    'primary' in value &&
    typeof value.primary === 'boolean'
  );
}
