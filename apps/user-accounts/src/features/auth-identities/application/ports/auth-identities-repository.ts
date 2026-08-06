import type { AuthIdentity, AuthIdentityProvider } from '../../domain/auth-identity.entity.js';
import type {
  AuthIdentityCreateRepositoryParams,
  UpdateAuthIdentityProviderProfileParams,
} from '../types/auth-identities.types.js';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';

export abstract class AuthIdentitiesRepository {
  abstract createIfAbsent(
    params: AuthIdentityCreateRepositoryParams,
    ctx?: TransactionContext,
  ): Promise<AuthIdentity | null>;
  abstract findAuthIdentity(
    providerSubject: string,
    provider: AuthIdentityProvider,
    ctx?: TransactionContext,
  ): Promise<AuthIdentity | null>;
  abstract findByUserAndProvider(
    userId: number,
    provider: AuthIdentityProvider,
    ctx?: TransactionContext,
  ): Promise<AuthIdentity | null>;
  abstract updateProviderProfile(
    params: UpdateAuthIdentityProviderProfileParams,
    ctx?: TransactionContext,
  ): Promise<AuthIdentity>;
}
