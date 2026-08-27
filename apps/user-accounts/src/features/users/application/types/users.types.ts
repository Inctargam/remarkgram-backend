import type { ConfirmationInfo } from '../../domain/value-objects/confirmation-info.js';
import type { AuthIdentityProvider } from '../../../auth-identities/domain/auth-identity.entity.js';

export type CreateUserParams = {
  username: string;
  email: string;
  password: string;
  confirmation?: ConfirmationInfo;
};

export type RegisterUserParams = Pick<CreateUserParams, 'username' | 'email' | 'password'>;

export type CreateUserRepositoryParams = {
  username: string;
  email: string;
  hash: string;
  createdAt: Date;
  confirmation: ConfirmationInfo;
};
export type CreateOAuthRepositoryParams = {
  email: string;
  createdAt: Date;
  confirmation: ConfirmationInfo;
};

export type ReleaseExpiredRegistrationCredentialsParams = Pick<RegisterUserParams, 'username' | 'email'> & {
  now: Date;
};

export type ReleaseExpiredRegistrationByEmailParams = {
  email: string;
  now: Date;
};

export type UpdateConfirmationCodeParams = {
  userId: number;
  expectedCode: string;
  newCode: string;
  expiration: Date;
};

export type CurrentUserView = {
  id: number;
  username: string;
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  oauthProviders: AuthIdentityProvider[];
  createdAt: Date;
};
