import type { User } from '../../domain/entities/user.entity.js';
import type {
  CreateOAuthRepositoryParams,
  CreateUserRepositoryParams,
  ReleaseExpiredRegistrationCredentialsParams,
  ReleaseExpiredRegistrationByEmailParams,
  UpdateConfirmationCodeParams,
} from '../types/users.types.js';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';

export abstract class UsersRepository {
  abstract findMany(): Promise<User[]>;
  abstract findById(id: number, ctx?: TransactionContext): Promise<User | null>;
  abstract findByEmail(email: string, ctx?: TransactionContext): Promise<User | null>;
  abstract isUsernameExists(username: string): Promise<boolean>;
  abstract isEmailExists(email: string): Promise<boolean>;
  abstract create(params: CreateUserRepositoryParams): Promise<User>;
  abstract createOAuth(params: CreateOAuthRepositoryParams, ctx?: TransactionContext): Promise<User>;
  abstract confirmForOAuth(userId: number, ctx?: TransactionContext): Promise<User | null>;
  abstract releaseExpiredRegistrationCredentials(
    params: ReleaseExpiredRegistrationCredentialsParams,
  ): Promise<void>;
  abstract releaseExpiredRegistrationByEmail(
    params: ReleaseExpiredRegistrationByEmailParams,
    ctx?: TransactionContext,
  ): Promise<void>;
  abstract confirmUser(code: string): Promise<boolean>;
  abstract updateConfirmationCode(params: UpdateConfirmationCodeParams): Promise<boolean>;
}
