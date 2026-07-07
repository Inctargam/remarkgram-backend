import type { ConfirmationInfo } from '../../domain/value-objects/confirmation-info.js';
import type { PasswordRecoveryInfo } from '../../domain/value-objects/password-recovery-info.js';

export type CreateUserParams = {
  username: string;
  email: string;
  password: string;
  confirmation?: ConfirmationInfo;
  passwordRecovery?: PasswordRecoveryInfo;
};

export type RegisterUserParams = Pick<CreateUserParams, 'username' | 'email' | 'password'>;

export type CreateUserRepositoryParams = {
  username: string;
  email: string;
  hash: string;
  createdAt: Date;
  confirmation: ConfirmationInfo;
  passwordRecovery: PasswordRecoveryInfo;
};

export type ReleaseExpiredRegistrationCredentialsParams = Pick<RegisterUserParams, 'username' | 'email'> & {
  now: Date;
};

export type ConfirmUserResult = {
  wasConfirmed: boolean;
  checkedAt: Date;
};

export type UpdateConfirmationCodeParams = {
  userId: number;
  code: string;
  expiration: Date;
};
