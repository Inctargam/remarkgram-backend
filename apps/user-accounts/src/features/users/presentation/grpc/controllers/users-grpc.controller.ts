import type { DeleteAvatarRequest, DeleteAvatarResponse } from '@app/user-accounts-grpc';
import { DeleteAvatarCommand } from '../../../application/use-cases/delete-avatar.use-case.js';
import { Controller, UseFilters } from '@nestjs/common';
import type { SetAvatarRequest, SetAvatarResponse } from '@app/user-accounts-grpc';
import { SetAvatarCommand } from '../../../application/use-cases/set-avatar.use-case.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  GetMyProfileRequest,
  GetCurrentUserRequest,
  GetCurrentUserResponse,
  GetMyProfileResponse,
  GetPublicProfileRequest,
  GetPublicProfileResponse,
  GetUsersResponse,
} from '@app/user-accounts-grpc';
import {
  OAuthProvider,
  UpdateProfileInfoRequest,
  UpdateProfileInfoResponse,
  UsersServiceControllerMethods,
} from '@app/user-accounts-grpc';
import { UserAccountsRpcExceptionFilter } from '../../../../../common/grpc/filters/user-accounts-rpc-exception.filter.js';
import { GetUsersQuery } from '../../../application/use-cases/get-users.use-case.js';
import { GetCurrentUserQuery } from '../../../application/use-cases/get-current-user.use-case.js';
import type { AuthIdentityProvider } from '../../../../auth-identities/domain/auth-identity.entity.js';
import { UpdateProfileInfoCommand } from '../../../application/use-cases/update-profile-info.use-case.js';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { isValidNumericEntityId } from '@app/validation';
import { GetPublicProfileQuery } from '../../../application/use-cases/get-public-profile.query-handler.js';
import { GetMyProfileQuery } from '../../../application/use-cases/get-my-profile.query-handler.js';

@Controller()
@UsersServiceControllerMethods()
@UseFilters(UserAccountsRpcExceptionFilter)
export class UsersGrpcController {
  constructor(
    private readonly queryBus: QueryBus,
    private commandBus: CommandBus,
  ) {}

  async deleteAvatar(request: DeleteAvatarRequest): Promise<DeleteAvatarResponse> {
    await this.commandBus.execute(new DeleteAvatarCommand(request));
    return {};
  }

  async setAvatar(request: SetAvatarRequest): Promise<SetAvatarResponse> {
    await this.commandBus.execute(new SetAvatarCommand(request));
    return {};
  }

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
  async updateProfileInfo(request: UpdateProfileInfoRequest): Promise<UpdateProfileInfoResponse> {
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
    const cmd = new UpdateProfileInfoCommand({
      userId: Number(request.userId),
      username: request.username,
      personalInfo: {
        firstName: request.personalInfo.firstName,
        lastName: request.personalInfo.lastName,
        dateOfBirth: request.personalInfo?.dateOfBirth ?? null,
        aboutMe: request.personalInfo?.aboutMe ?? null,
        countryCode: request.personalInfo?.countryCode ?? null,
        city: request.personalInfo?.city ?? null,
      },
    });
    await this.commandBus.execute(cmd);
    return {};
  }

  async getPublicProfile(request: GetPublicProfileRequest): Promise<GetPublicProfileResponse> {
    if (!isValidNumericEntityId(+request.userId)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Invalid userId',
      });
    }
    const profile = await this.queryBus.execute(new GetPublicProfileQuery(Number(request.userId)));
    return {
      userId: profile.userId,
      username: profile.username,
      avatarFileId: profile?.avatarFileId ?? undefined,
      aboutMe: profile?.aboutMe ?? undefined,
    };
  }

  async getMyProfile(request: GetMyProfileRequest): Promise<GetMyProfileResponse> {
    if (!isValidNumericEntityId(+request.userId)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Invalid userId',
      });
    }
    const profile = await this.queryBus.execute(new GetMyProfileQuery(Number(request.userId)));
    return {
      userId: profile.userId,
      username: profile.username,
      avatarFileId: profile?.avatarFileId ?? undefined,
      aboutMe: profile?.aboutMe ?? undefined,
      city: profile?.city ?? undefined,
      countryCode: profile?.countryCode ?? undefined,
      firstName: profile?.firstName ?? undefined,
      lastName: profile?.lastName ?? undefined,
      dateOfBirth: profile?.dateOfBirth ?? undefined,
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
