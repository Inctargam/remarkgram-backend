import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { SessionsServiceControllerMethods } from '@app/user-accounts-grpc';
import type {
  DeleteDeviceRequest,
  DeleteDeviceResponse,
  DeleteOtherDevicesRequest,
  DeleteOtherDevicesResponse,
  GetDevicesRequest,
  GetDevicesResponse,
  LogoutCurrentSessionRequest,
  LogoutCurrentSessionResponse,
} from '@app/user-accounts-grpc';
import { UserAccountsRpcExceptionFilter } from '../../../../../common/grpc/filters/user-accounts-rpc-exception.filter.js';
import { DeleteOtherSessionsCommand } from '../../../application/use-cases/delete-other-sessions.use-case.js';
import { DeleteSessionCommand } from '../../../application/use-cases/delete-session.use-case.js';
import { GetSessionsQuery } from '../../../application/use-cases/get-sessions.use-case.js';
import { LogoutCurrentSessionCommand } from '../../../application/use-cases/logout-current-session.use-case.js';

@Controller()
@SessionsServiceControllerMethods()
@UseFilters(UserAccountsRpcExceptionFilter)
export class SessionsGrpcController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  /** Возвращает список активных пользовательских устройств для текущей refresh-сессии. */
  async getDevices(request: GetDevicesRequest): Promise<GetDevicesResponse> {
    if (!request.auth) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid authorization method',
      });
    }

    const sessions = await this.queryBus.execute(new GetSessionsQuery(request.auth));

    return {
      devices: sessions.map((session) => ({
        ip: session.ip,
        title: session.deviceName,
        lastActiveDate: session.lastActiveAt.toISOString(),
        deviceId: session.sessionId,
        isCurrent: session.isCurrent,
      })),
    };
  }

  /** Выполняет soft delete текущей сессии пользователя. */
  async logoutCurrentSession(request: LogoutCurrentSessionRequest): Promise<LogoutCurrentSessionResponse> {
    //::TODO рекомендуют для безопасности использовать идемпотентный подход
    if (!request.auth) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid authorization method',
      });
    }

    await this.commandBus.execute(new LogoutCurrentSessionCommand(request.auth));

    return {};
  }

  /** Выполняет soft delete выбранной пользовательской сессии по deviceId. */
  async deleteDevice(request: DeleteDeviceRequest): Promise<DeleteDeviceResponse> {
    if (!request.auth) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid authorization method',
      });
    }

    await this.commandBus.execute(
      new DeleteSessionCommand({
        auth: request.auth,
        sessionId: request.deviceId,
      }),
    );

    return {};
  }

  /** Выполняет soft delete всех пользовательских сессий, кроме текущей. */
  async deleteOtherDevices(request: DeleteOtherDevicesRequest): Promise<DeleteOtherDevicesResponse> {
    if (!request.auth) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid authorization method',
      });
    }

    await this.commandBus.execute(new DeleteOtherSessionsCommand(request.auth));

    return {};
  }
}
