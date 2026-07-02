import { Controller, UseFilters } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { SessionsServiceControllerMethods } from '@app/user-accounts-grpc';
import type { GetDevicesRequest, GetDevicesResponse } from '@app/user-accounts-grpc';
import { UserAccountsRpcExceptionFilter } from '../../../../common/presentation/grpc/user-accounts-rpc-exception.filter.js';
import { GetSessionsQuery } from '../../application/use-cases/get-sessions.use-case.js';

@Controller()
@SessionsServiceControllerMethods()
@UseFilters(UserAccountsRpcExceptionFilter)
export class SessionsGrpcController {
  constructor(private readonly queryBus: QueryBus) {}

  async getDevices(request: GetDevicesRequest): Promise<GetDevicesResponse> {
    if (!request.auth) {
      throw new Error('Invalid authorization method');
    }

    const sessions = await this.queryBus.execute(new GetSessionsQuery(request.auth));

    return {
      devices: sessions.map((session) => ({
        ip: session.ip,
        title: session.deviceName,
        lastActiveDate: session.lastActiveAt.toISOString(),
        deviceId: session.sessionId,
      })),
    };
  }
}
