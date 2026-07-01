import { Body, Controller, Headers, HttpCode, Ip, Post, Req, Res } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import type { Response } from 'express';
import { UserAccountsHttpConfig } from '../../../config/user-accounts-http.config.js';
import { UserAccountsGrpcClientAdapter } from '../../../infrastructure/grpc/user-accounts-grpc-client.adapter.js';
import type { RequestWithRefreshTokenCookie } from '../auth-request.types.js';
import { LoginInputDto } from '../dto/login-input.dto.js';
import { mapGrpcErrorToHttp } from '../grpc-error.mapper.js';

@Controller('auth')
export class AuthHttpController {
  constructor(
    private readonly userAccountsClient: UserAccountsGrpcClientAdapter,
    private readonly config: UserAccountsHttpConfig,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: LoginInputDto,
    @Req() request: RequestWithRefreshTokenCookie,
    @Res({ passthrough: true }) response: Response,
    @Headers('User-Agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<{ accessToken: string }> {
    try {
      const tokens = await this.userAccountsClient.login({
        loginOrEmail: input.loginOrEmail,
        password: input.password,
        ip,
        deviceName: userAgent ?? 'unknown',
        currentRefreshToken: request.cookies.refreshToken,
      });

      this.setRefreshTokenCookie(response, tokens.refreshToken);
      return { accessToken: tokens.accessToken };
    } catch (error) {
      throw mapGrpcErrorToHttp(error);
    }
  }

  @Post('refresh-token')
  @HttpCode(200)
  async refreshToken(
    @Req() request: RequestWithRefreshTokenCookie,
    @Res({ passthrough: true }) response: Response,
    @Headers('User-Agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<{ accessToken: string }> {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      throw mapGrpcErrorToHttp({
        code: status.UNAUTHENTICATED,
        details: 'Invalid authorization method',
      });
    }

    try {
      const tokens = await this.userAccountsClient.refreshToken({
        refreshToken,
        ip,
        deviceName: userAgent ?? 'unknown',
      });

      this.setRefreshTokenCookie(response, tokens.refreshToken);
      return { accessToken: tokens.accessToken };
    } catch (error) {
      throw mapGrpcErrorToHttp(error);
    }
  }

  private setRefreshTokenCookie(response: Response, refreshToken: string): void {
    response.cookie('refreshToken', refreshToken, {
      maxAge: this.config.refreshTokenCookieMaxAgeMs,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });
  }
}
