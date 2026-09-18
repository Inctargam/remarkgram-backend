import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  GetCurrentUserRequest,
  GetCurrentUserResponse,
  GetUsersResponse,
} from '@app/user-accounts-grpc';
import {
  OAuthProvider,
  UpdateUserProfileRequest,
  UpdateUserProfileResponse,
  UsersServiceControllerMethods,
} from '@app/user-accounts-grpc';
import { UserAccountsRpcExceptionFilter } from '../../../../../common/grpc/filters/user-accounts-rpc-exception.filter.js';
import { GetUsersQuery } from '../../../application/use-cases/get-users.use-case.js';
import { GetCurrentUserQuery } from '../../../application/use-cases/get-current-user.use-case.js';
import type { AuthIdentityProvider } from '../../../../auth-identities/domain/auth-identity.entity.js';
import { UpdateUserProfileCommand } from '../../../application/use-cases/update-user-profile.use-case.js';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { isValidNumericEntityId } from '@app/validation';
@Controller()
@UsersServiceControllerMethods()
@UseFilters(UserAccountsRpcExceptionFilter)
export class UsersGrpcController {
  constructor(
    private readonly queryBus: QueryBus,
    private commandBus: CommandBus,
  ) {}

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
  async updateUserProfile(request: UpdateUserProfileRequest): Promise<UpdateUserProfileResponse> {
    if (!request.personalInfo) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Filed personalInfo is required',
      });
    }
    if (!isValidNumericEntityId(+request.userId)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Invalid userId',
      });
    }
    const cmd = new UpdateUserProfileCommand({
      userId: Number(request.userId),
      username: request.username,
      personalInfo: {
        firstName: request.personalInfo.firstName,
        lastName: request.personalInfo.lastName,
        dateOfBirth: request.personalInfo?.dateOfBirth ?? null,
        aboutMe: request.personalInfo?.aboutMe ?? null,
      },
    });
    await this.commandBus.execute(cmd);
    return {};
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
