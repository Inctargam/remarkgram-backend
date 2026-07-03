import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { AuthServiceControllerMethods } from '@app/user-accounts-grpc';
import type { LoginRequest, RefreshTokenRequest, TokenPairResponse } from '@app/user-accounts-grpc';
import { UserAccountsRpcExceptionFilter } from '../../../../../common/presentation/grpc/user-accounts-rpc-exception.filter.js';
import { LoginCommand } from '../../../application/use-cases/login.use-case.js';
import { RefreshTokenCommand } from '../../../application/use-cases/refresh-token.use-case.js';

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
      throw new Error('Invalid authorization method');
    }

    return this.commandBus.execute(
      new RefreshTokenCommand({
        auth: request.auth,
        ip: request.ip,
        deviceName: request.deviceName,
      }),
    );
  }
}
