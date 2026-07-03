import type { ConfirmationInfo, PasswordRecoveryInfo } from '../../domain/entities/user.entity.js';

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

export type UpdateConfirmationCodeParams = {
  email: string;
  code: string;
  expiration: Date;
};
