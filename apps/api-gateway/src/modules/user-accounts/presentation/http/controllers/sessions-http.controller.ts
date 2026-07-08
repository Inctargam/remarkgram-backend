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
import {
  ApiBadGatewayResponse,
  ApiCookieAuth,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { firstValueFrom, map, type Observable } from 'rxjs';
import { ApiErrorResponseDto } from '../../../../../common/http/api-error-response.dto.js';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import type { RequestWithRefreshSession } from '../auth-request.types.js';
import { SessionResponseDto } from '../dto/output/session-response.dto.js';
import { RefreshTokenGuard } from '../guards/refresh-token.guard.js';

@ApiTags('Sessions')
@ApiExtraModels(ApiErrorResponseDto)
@ApiCookieAuth('refreshToken')
@ApiUnauthorizedResponse({ description: 'The refresh token or its session is invalid.' })
@ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' })
@ApiServiceUnavailableResponse({ description: 'The user-accounts service is unavailable.' })
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
  @ApiOperation({ summary: 'Get the active sessions of the current user' })
  @ApiOkResponse({
    description: 'Active, unexpired and non-revoked refresh sessions.',
    type: [SessionResponseDto],
  })
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
  @ApiOperation({ summary: 'Revoke all sessions except the current one' })
  @ApiNoContentResponse({ description: 'All other sessions were revoked.' })
  async deleteOtherSessions(@Req() request: RequestWithRefreshSession): Promise<void> {
    await firstValueFrom(this.sessionsClient.revokeOtherSessions({ auth: request.refreshTokenClaims }));
  }

  @Delete(':sessionId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a selected session' })
  @ApiParam({ name: 'sessionId', format: 'uuid', description: 'Session identifier.' })
  @ApiNoContentResponse({ description: 'The selected session was revoked.' })
  @ApiResponse({
    status: 404,
    description: 'The session does not exist or does not belong to the current user.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
        examples: {
          sessionNotFound: {
            summary: 'Session was not found',
            value: {
              statusCode: 404,
              code: 'SESSION_NOT_FOUND',
              message: 'Session not found',
            },
          },
        },
      },
    },
  })
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
