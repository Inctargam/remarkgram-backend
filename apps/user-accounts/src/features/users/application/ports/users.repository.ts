import type { User } from '../../domain/entities/user.entity.js';
import type { ConfirmationInfo } from '../../domain/entities/user.entity.js';
import type { CreateUserRepositoryParams, UpdateConfirmationCodeParams } from '../types/users.types.js';

export abstract class UsersRepository {
  abstract findMany(): Promise<User[]>;
  abstract findByLoginOrEmail(loginOrEmail: string): Promise<User | null>;
  abstract isUsernameExists(username: string): Promise<boolean>;
  abstract isEmailExists(email: string): Promise<boolean>;
  abstract create(params: CreateUserRepositoryParams): Promise<User>;
  abstract getConfirmationInfo(code: string): Promise<ConfirmationInfo | null>;
  abstract confirmUser(code: string): Promise<boolean>;
  abstract updateConfirmationCode(params: UpdateConfirmationCodeParams): Promise<boolean>;
}
