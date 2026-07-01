import { Controller, Get, Req } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import type { Device } from '@app/user-accounts-grpc';
import { UserAccountsGrpcClientAdapter } from '../../../infrastructure/grpc/user-accounts-grpc-client.adapter.js';
import type { RequestWithRefreshTokenCookie } from '../auth-request.types.js';
import { mapGrpcErrorToHttp } from '../grpc-error.mapper.js';

@Controller('security/devices')
export class DevicesHttpController {
  constructor(private readonly userAccountsClient: UserAccountsGrpcClientAdapter) {}

  @Get()
  async getDevices(@Req() request: RequestWithRefreshTokenCookie): Promise<Device[]> {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      throw mapGrpcErrorToHttp({
        code: status.UNAUTHENTICATED,
        details: 'Invalid authorization method',
      });
    }

    try {
      const response = await this.userAccountsClient.getDevices({ refreshToken });
      return response.devices;
    } catch (error) {
      throw mapGrpcErrorToHttp(error);
    }
  }
}
