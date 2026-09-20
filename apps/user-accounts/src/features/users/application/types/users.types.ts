import type { ConfirmationInfo } from '../../domain/value-objects/confirmation-info.js';
import type { AuthIdentityProvider } from '../../../auth-identities/domain/auth-identity.entity.js';
import { PersonalInfo, type CreatePersonalInfoProps } from '../../domain/value-objects/personal-info.js';

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

export type UpdateProfileInfoParams = {
  userId: number;
  username: string;
  personalInfo: CreatePersonalInfoProps;
};

export type UpdateProfileInfoRepositoryParams = {
  userId: number;
  username: string;
  personalInfo: PersonalInfo;
};

export type PublicUserProfileView = {
  userId: number;
  username: string;
  aboutMe: string | null;
  avatarFileId: string | null;
};

export type MyProfileView = {
  userId: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  aboutMe: string | null;
  avatarFileId: string | null;
  city: string | null;
  countryCode: string | null;
  dateOfBirth: string | null;
};
