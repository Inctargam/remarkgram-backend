import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { SessionsServiceControllerMethods } from '@app/user-accounts-grpc';
import type {
  GetSessionsRequest,
  GetSessionsResponse,
  LogoutCurrentSessionRequest,
  LogoutCurrentSessionResponse,
  RevokeOtherSessionsRequest,
  RevokeOtherSessionsResponse,
  RevokeSessionRequest,
  RevokeSessionResponse,
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

  /** Возвращает список активных пользовательских refresh-сессий. */
  async getSessions(request: GetSessionsRequest): Promise<GetSessionsResponse> {
    if (!request.auth) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid authorization method',
      });
    }

    const sessions = await this.queryBus.execute(new GetSessionsQuery(request.auth));

    return {
      sessions: sessions.map((session) => ({
        ip: session.ip,
        deviceName: session.deviceName,
        lastActiveAt: session.lastActiveAt.toISOString(),
        sessionId: session.sessionId,
        isCurrent: session.isCurrent,
      })),
    };
  }

  /** Отзывает текущую сессию пользователя. */
  async logoutCurrentSession(request: LogoutCurrentSessionRequest): Promise<LogoutCurrentSessionResponse> {
    if (!request.auth) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid authorization method',
      });
    }

    await this.commandBus.execute(new LogoutCurrentSessionCommand(request.auth));

    return {};
  }

  /** Отзывает выбранную пользовательскую сессию по sessionId. */
  async revokeSession(request: RevokeSessionRequest): Promise<RevokeSessionResponse> {
    if (!request.auth) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid authorization method',
      });
    }

    await this.commandBus.execute(
      new DeleteSessionCommand({
        auth: request.auth,
        sessionId: request.sessionId,
      }),
    );

    return {};
  }

  /** Отзывает все пользовательские сессии, кроме текущей. */
  async revokeOtherSessions(
    request: RevokeOtherSessionsRequest,
  ): Promise<RevokeOtherSessionsResponse> {
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
