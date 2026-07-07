import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  type OnModuleInit,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  SESSIONS_SERVICE_NAME,
  type SessionsServiceClient,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, map, type Observable } from 'rxjs';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import type { RequestWithRefreshSession } from '../auth-request.types.js';
import { DeviceResponseDto } from '../dto/output/device-response.dto.js';
import { RefreshTokenGuard } from '../guards/refresh-token.guard.js';
import { DeleteDeviceParamsDto } from '../dto/input/delete-device-params.dto.ts';

@Controller('security/devices')
export class DevicesHttpController implements OnModuleInit {
  private sessionsClient!: SessionsServiceClient;

  constructor(
    @Inject(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.sessionsClient = this.grpcClient.getService<SessionsServiceClient>(SESSIONS_SERVICE_NAME);
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Get()
  getDevices(@Req() request: RequestWithRefreshSession): Observable<DeviceResponseDto[]> {
    return this.sessionsClient
      .getDevices({ auth: request.refreshTokenClaims })
      .pipe(
        map((response) =>
          response.devices.map(
            (device) =>
              new DeviceResponseDto(device.ip, device.title, device.lastActiveDate, device.deviceId),
          ),
        ),
      );
  }
  @Public()
  @UseGuards(RefreshTokenGuard)
  @HttpCode(204)
  @Delete()
  async deleteOtherDevices(@Req() request: RequestWithRefreshSession): Promise<void> {
    await firstValueFrom(
      this.sessionsClient.deleteOtherDevices({
        auth: request.refreshTokenClaims,
      }),
    );
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @HttpCode(204)
  @Delete(':deviceId')
  async deleteDevice(
    @Req() request: RequestWithRefreshSession,
    @Param() params: DeleteDeviceParamsDto,
  ): Promise<void> {
    await firstValueFrom(
      this.sessionsClient.deleteDevice({
        auth: request.refreshTokenClaims,
        deviceId: params.deviceId,
      }),
    );
  }
}
