import { Injectable } from '@nestjs/common';
import { AuthIdentitiesRepository } from '../../application/ports/auth-identities-repository.js';
import { AuthIdentity, AuthIdentityProvider } from '../../domain/auth-identity.entity.js';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';
import type { Prisma } from '../../../../database/generated/client.js';
import { PrismaService } from '../../../../database/prisma.service.js';
import type {
  AuthIdentityCreateRepositoryParams,
  UpdateAuthIdentityProviderProfileParams,
} from '../../application/types/auth-identities.types.js';

type PrismaClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PrismaAuthIdentitiesRepository implements AuthIdentitiesRepository {
  constructor(private readonly prisma: PrismaService) {}
  getClient(ctx?: TransactionContext): PrismaClient {
    return (ctx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  async createIfAbsent(
    params: AuthIdentityCreateRepositoryParams,
    ctx?: TransactionContext,
  ): Promise<AuthIdentity | null> {
    const client = this.getClient(ctx);

    const [row] = await client.authIdentity.createManyAndReturn({
      data: params,
      skipDuplicates: true,
    });

    return row ? AuthIdentity.restore(row) : null;
  }

  async findAuthIdentity(
    providerSubject: string,
    provider: AuthIdentityProvider,
    ctx?: TransactionContext,
  ): Promise<AuthIdentity | null> {
    const client = this.getClient(ctx);
    const identity = await client.authIdentity.findUnique({
      where: {
        provider_providerSubject: { provider, providerSubject },
      },
      include: {
        user: true,
      },
    });
    if (!identity) {
      return null;
    }
    return AuthIdentity.restore(identity);
  }

  async findByUserAndProvider(
    userId: number,
    provider: AuthIdentityProvider,
    ctx?: TransactionContext,
  ): Promise<AuthIdentity | null> {
    // Ищем identity по составному уникальному ограничению @@unique([userId, provider]).
    const identity = await this.getClient(ctx).authIdentity.findUnique({
      where: { userId_provider: { userId, provider } },
    });

    return identity ? AuthIdentity.restore(identity) : null;
  }

  async updateProviderProfile(
    params: UpdateAuthIdentityProviderProfileParams,
    ctx?: TransactionContext,
  ): Promise<AuthIdentity> {
    const identity = await this.getClient(ctx).authIdentity.update({
      where: { id: params.identityId },
      data: {
        providerEmail: params.providerEmail,
        providerEmailVerified: params.providerEmailVerified,
        username: params.username,
        avatarUrl: params.avatarUrl,
      },
    });

    return AuthIdentity.restore(identity);
  }
}
