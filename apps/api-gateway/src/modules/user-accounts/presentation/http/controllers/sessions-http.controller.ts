import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  type OnModuleInit,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  SESSIONS_SERVICE_NAME,
  type SessionsServiceClient,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Response } from 'express';
import { firstValueFrom, map, type Observable } from 'rxjs';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import type { RequestWithRefreshSession } from '../auth-request.types.js';
import { SessionResponseDto } from '../dto/output/session-response.dto.js';
import { RefreshTokenGuard } from '../guards/refresh-token.guard.js';
import { ApiDeleteOtherSessions } from '../swagger/sessions/delete/delete-other-sessions.swagger.js';
import { ApiDeleteSession } from '../swagger/sessions/delete/delete-session.swagger.js';
import { ApiGetSessions } from '../swagger/sessions/get/get-sessions.swagger.js';
import { ApiSessionsController } from '../swagger/sessions/sessions-controller.swagger.js';

@ApiSessionsController()
@Public()
@UseGuards(RefreshTokenGuard)
@Controller('security/sessions')
export class SessionsHttpController implements OnModuleInit {
  private sessionsClient!: SessionsServiceClient;

  constructor(
    @Inject(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.sessionsClient = this.grpcClient.getService<SessionsServiceClient>(SESSIONS_SERVICE_NAME);
  }

  @Get()
  @ApiGetSessions()
  getSessions(@Req() request: RequestWithRefreshSession): Observable<SessionResponseDto[]> {
    return this.sessionsClient.getSessions({ auth: request.refreshTokenClaims }).pipe(
      map((response) =>
        response.sessions.map(
          (session) =>
            new SessionResponseDto({
              sessionId: session.sessionId,
              deviceName: session.deviceName,
              ip: session.ip,
              lastActiveAt: session.lastActiveAt,
              isCurrent: session.isCurrent,
            }),
        ),
      ),
    );
  }

  @Delete()
  @HttpCode(204)
  @ApiDeleteOtherSessions()
  async deleteOtherSessions(@Req() request: RequestWithRefreshSession): Promise<void> {
    await firstValueFrom(this.sessionsClient.revokeOtherSessions({ auth: request.refreshTokenClaims }));
  }

  @Delete(':sessionId')
  @HttpCode(204)
  @ApiDeleteSession()
  async deleteSession(
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Req() request: RequestWithRefreshSession,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await firstValueFrom(
      this.sessionsClient.revokeSession({
        auth: request.refreshTokenClaims,
        sessionId,
      }),
    );

    if (sessionId === request.refreshTokenClaims.sessionId) {
      this.clearRefreshTokenCookie(response);
    }
  }

  private clearRefreshTokenCookie(response: Response): void {
    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });
  }
}
