import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../../../../common/presentation/http/decorators/public.decorator.js';
import { UserAccountsGrpcClientAdapter } from '../../../infrastructure/grpc/user-accounts-grpc-client.adapter.js';
import type { RequestWithRefreshSession } from '../auth-request.types.js';
import { DeviceResponseDto } from '../dto/output/device-response.dto.js';
import { RefreshTokenGuard } from '../guards/refresh-token.guard.js';

@Controller('security/devices')
export class DevicesHttpController {
  constructor(private readonly userAccountsClient: UserAccountsGrpcClientAdapter) {}

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Get()
  async getDevices(@Req() request: RequestWithRefreshSession): Promise<DeviceResponseDto[]> {
    const response = await this.userAccountsClient.getDevices({ auth: request.refreshTokenClaims });
    return response.devices.map((device) => DeviceResponseDto.fromGrpc(device));
  }
}
