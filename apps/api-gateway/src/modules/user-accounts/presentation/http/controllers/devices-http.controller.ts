import { Controller, Get, Inject, type OnModuleInit, Req, UseGuards } from '@nestjs/common';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  SESSIONS_SERVICE_NAME,
  type SessionsServiceClient,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import { map, type Observable } from 'rxjs';
import { Public } from '../../../../../common/presentation/http/decorators/public.decorator.js';
import type { RequestWithRefreshSession } from '../auth-request.types.js';
import { DeviceResponseDto } from '../dto/output/device-response.dto.js';
import { RefreshTokenGuard } from '../guards/refresh-token.guard.js';

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
      .pipe(map((response) => response.devices.map((device) => DeviceResponseDto.fromGrpc(device))));
  }
}
