import { Controller, UseFilters } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { OAuthProvider, UsersServiceControllerMethods } from '@app/user-accounts-grpc';
import type {
  GetCurrentUserRequest,
  GetCurrentUserResponse,
  GetUsersResponse,
} from '@app/user-accounts-grpc';
import { UserAccountsRpcExceptionFilter } from '../../../../../common/grpc/filters/user-accounts-rpc-exception.filter.js';
import { GetUsersQuery } from '../../../application/use-cases/get-users.use-case.js';
import { GetCurrentUserQuery } from '../../../application/use-cases/get-current-user.use-case.js';
import type { AuthIdentityProvider } from '../../../../auth-identities/domain/auth-identity.entity.js';

@Controller()
@UsersServiceControllerMethods()
@UseFilters(UserAccountsRpcExceptionFilter)
export class UsersGrpcController {
  constructor(private readonly queryBus: QueryBus) {}

  async getUsers(): Promise<GetUsersResponse> {
    const users = await this.queryBus.execute(new GetUsersQuery());

    return {
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
      })),
    };
  }

  async getCurrentUser(request: GetCurrentUserRequest): Promise<GetCurrentUserResponse> {
    const user = await this.queryBus.execute(new GetCurrentUserQuery(request.userId));

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      hasPassword: user.hasPassword,
      oauthProviders: user.oauthProviders.map((provider) => this.toGrpcOAuthProvider(provider)),
      createdAt: user.createdAt.toISOString(),
    };
  }

  private toGrpcOAuthProvider(provider: AuthIdentityProvider): OAuthProvider {
    switch (provider) {
      case 'github':
        return OAuthProvider.OAUTH_PROVIDER_GITHUB;
      case 'google':
        return OAuthProvider.OAUTH_PROVIDER_GOOGLE;
    }
  }
}
