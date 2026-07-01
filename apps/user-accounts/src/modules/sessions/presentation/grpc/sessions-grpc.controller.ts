import { Controller } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { SessionsServiceControllerMethods } from '@app/user-accounts-grpc';
import type { GetDevicesRequest, GetDevicesResponse } from '@app/user-accounts-grpc';
import { createUnauthenticatedRpcException } from '../../../../common/presentation/grpc/rpc-exception.factory.js';
import { ValidateRefreshTokenQuery } from '../../../auth/application/use-cases/validate-refresh-token.use-case.js';
import { GetSessionsQuery } from '../../application/use-cases/get-sessions.use-case.js';

@Controller()
@SessionsServiceControllerMethods()
export class SessionsGrpcController {
  constructor(private readonly queryBus: QueryBus) {}

  async getDevices(request: GetDevicesRequest): Promise<GetDevicesResponse> {
    try {
      const payload = await this.queryBus.execute(new ValidateRefreshTokenQuery(request.refreshToken));
      const sessions = await this.queryBus.execute(new GetSessionsQuery(payload.sub));

      return {
        devices: sessions.map((session) => ({
          ip: session.ip,
          title: session.deviceName,
          lastActiveDate: session.lastActiveAt.toISOString(),
          deviceId: session.sessionId,
        })),
      };
    } catch (error) {
      throw createUnauthenticatedRpcException(error);
    }
  }
}
