import type { OAuthIdentityClaims } from '@app/user-accounts-grpc';
import type { AuthenticateOAuthServiceParams } from '../../../../auth-identities/application/types/auth-identities.types.js';
import { mapOAuthProvider } from './oauth-provider.mapper.js';

/** Явно преобразует транспортный gRPC-контракт в application DTO. */
export function mapOAuthIdentity(identity: OAuthIdentityClaims): AuthenticateOAuthServiceParams {
  return {
    provider: mapOAuthProvider(identity.provider),
    providerSubject: identity.subject.trim(),
    emails: identity.emails.map((email) => ({
      email: email.email,
      verified: email.verified,
      primary: email.primary,
    })),
  };
}
