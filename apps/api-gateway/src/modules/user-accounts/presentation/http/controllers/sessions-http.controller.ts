import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  type OnModuleInit,
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
import { DeviceResponseDto } from '../dto/output/device-response.dto.js';
import { RefreshTokenGuard } from '../guards/refresh-token.guard.js';

@Public()
@UseGuards(RefreshTokenGuard)
@Controller('auth/sessions')
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
  getSessions(@Req() request: RequestWithRefreshSession): Observable<DeviceResponseDto[]> {
    return this.sessionsClient
      .getDevices({ auth: request.refreshTokenClaims })
      .pipe(
        map((response) =>
          response.devices.map(
            (device) =>
              new DeviceResponseDto(
                device.ip,
                device.title,
                device.lastActiveDate,
                device.deviceId,
                device.isCurrent,
              ),
          ),
        ),
      );
  }

  @Delete('current')
  @HttpCode(204)
  async logoutCurrentSession(
    @Req() request: RequestWithRefreshSession,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await firstValueFrom(this.sessionsClient.logoutCurrentSession({ auth: request.refreshTokenClaims }));
    this.clearRefreshTokenCookie(response);
  }

  @Delete('others')
  @HttpCode(204)
  async deleteOtherSessions(@Req() request: RequestWithRefreshSession): Promise<void> {
    await firstValueFrom(this.sessionsClient.deleteOtherDevices({ auth: request.refreshTokenClaims }));
  }

  @Delete(':sessionId')
  @HttpCode(204)
  async deleteSession(
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Req() request: RequestWithRefreshSession,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await firstValueFrom(
      this.sessionsClient.deleteDevice({
        auth: request.refreshTokenClaims,
        deviceId: sessionId,
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
