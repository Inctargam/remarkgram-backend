import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { AuthenticateOAuthRequest, AuthServiceControllerMethods } from '@app/user-accounts-grpc';
import type { LoginRequest, RefreshTokenRequest, TokenPairResponse } from '@app/user-accounts-grpc';
import { UserAccountsRpcExceptionFilter } from '../../../../../common/grpc/filters/user-accounts-rpc-exception.filter.js';
import { LoginCommand } from '../../../application/use-cases/login.use-case.js';
import { RefreshTokenCommand } from '../../../application/use-cases/refresh-token.use-case.js';
import { AuthenticateOAuthCommand } from '../../../application/use-cases/authenticate-oauth.use-case.ts';
import { mapOAuthIdentity } from '../mappers/oauth-identity.mapper.js';

@Controller()
@AuthServiceControllerMethods()
@UseFilters(UserAccountsRpcExceptionFilter)
export class AuthGrpcController {
  constructor(private readonly commandBus: CommandBus) {}

  async login(request: LoginRequest): Promise<TokenPairResponse> {
    return this.commandBus.execute(
      new LoginCommand({
        email: request.email,
        password: request.password,
        ip: request.ip,
        deviceName: request.deviceName,
        currentSession: request.currentSession,
      }),
    );
  }

  async refreshToken(request: RefreshTokenRequest): Promise<TokenPairResponse> {
    if (!request.auth) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid authorization method',
      });
    }

    return this.commandBus.execute(
      new RefreshTokenCommand({
        auth: request.auth,
        ip: request.ip,
        deviceName: request.deviceName,
      }),
    );
  }

  async authenticateOAuth(request: AuthenticateOAuthRequest): Promise<TokenPairResponse> {
    if (!request.identity) {
      throw new RpcException({
        status: status.INVALID_ARGUMENT,
        message: 'Invalid identity payload',
      });
    }
    return this.commandBus.execute(
      new AuthenticateOAuthCommand(
        {
          ip: request.ip,
          deviceName: request.deviceName,
        },
        mapOAuthIdentity(request.identity),
      ),
    );
  }
}
