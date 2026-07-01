import { Controller } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { AuthServiceControllerMethods } from '@app/user-accounts-grpc';
import type { LoginRequest, RefreshTokenRequest, TokenPairResponse } from '@app/user-accounts-grpc';
import { createUnauthenticatedRpcException } from '../../../../common/presentation/grpc/rpc-exception.factory.js';
import { LoginCommand } from '../../application/use-cases/login.use-case.js';
import { RefreshTokenCommand } from '../../application/use-cases/refresh-token.use-case.js';

@Controller()
@AuthServiceControllerMethods()
export class AuthGrpcController {
  constructor(private readonly commandBus: CommandBus) {}

  async login(request: LoginRequest): Promise<TokenPairResponse> {
    try {
      return await this.commandBus.execute(
        new LoginCommand({
          loginOrEmail: request.loginOrEmail,
          password: request.password,
          ip: request.ip,
          deviceName: request.deviceName,
          currentRefreshToken: request.currentRefreshToken,
        }),
      );
    } catch (error) {
      throw createUnauthenticatedRpcException(error);
    }
  }

  async refreshToken(request: RefreshTokenRequest): Promise<TokenPairResponse> {
    try {
      return await this.commandBus.execute(
        new RefreshTokenCommand({
          refreshToken: request.refreshToken,
          ip: request.ip,
          deviceName: request.deviceName,
        }),
      );
    } catch (error) {
      throw createUnauthenticatedRpcException(error);
    }
  }
}
