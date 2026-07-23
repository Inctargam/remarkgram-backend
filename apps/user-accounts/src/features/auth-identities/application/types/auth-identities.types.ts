import type { User } from '../../../users/domain/entities/user.entity.js';
import type { AuthIdentityProvider } from '../../domain/auth-identity.entity.js';

export type AuthIdentityCreateRepositoryParams = {
  userId: number;
  providerSubject: string;
  provider: AuthIdentityProvider;
  providerEmail: string | null;
  providerEmailVerified: boolean;
  username: string | null;
  avatarUrl: string | null;
};

export type UpdateAuthIdentityProviderProfileParams = {
  identityId: string;
  providerEmail: string | null;
  providerEmailVerified: boolean;
  username: string | null;
  avatarUrl: string | null;
};

export type OAuthEmail = {
  email: string;
  verified: boolean;
  primary: boolean;
};

export type AuthenticateOAuthServiceParams = {
  providerSubject: string;
  provider: AuthIdentityProvider;
  emails: OAuthEmail[];
  username: string | null;
  avatarUrl: string | null;
};

/** Успешные бизнес-результаты OAuth-аутентификации. Ошибочные сценарии представлены исключениями. */
export enum AuthenticateOAuthStatus {
  SIGNED_IN = 'signed-in',
  REGISTERED = 'registered',
  REGISTERED_EMAIL_CONFIRMATION_REQUIRED = 'registered-email-confirmation-required',
  IDENTITY_LINKED = 'identity-linked',
}

export type AuthenticateOAuthServiceResult =
  | { status: AuthenticateOAuthStatus.SIGNED_IN; user: User }
  | { status: AuthenticateOAuthStatus.REGISTERED; user: User }
  | { status: AuthenticateOAuthStatus.IDENTITY_LINKED; user: User }
  | { status: AuthenticateOAuthStatus.REGISTERED_EMAIL_CONFIRMATION_REQUIRED; user: User };
