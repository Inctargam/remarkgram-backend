import { Body, Controller, Headers, HttpCode, Ip, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../../../../common/presentation/http/decorators/public.decorator.js';
import { UserAccountsHttpConfig } from '../../../config/user-accounts-http.config.js';
import { UserAccountsGrpcClientAdapter } from '../../../infrastructure/grpc/user-accounts-grpc-client.adapter.js';
import type { RequestWithOptionalRefreshSession, RequestWithRefreshSession } from '../auth-request.types.js';
import { LoginInputDto } from '../dto/login-input.dto.js';
import { OptionalRefreshTokenGuard } from '../guards/optional-refresh-token.guard.js';
import { RefreshTokenGuard } from '../guards/refresh-token.guard.js';

@Controller('auth')
export class AuthHttpController {
  constructor(
    private readonly userAccountsClient: UserAccountsGrpcClientAdapter,
    private readonly config: UserAccountsHttpConfig,
  ) {}

  @Public()
  @UseGuards(OptionalRefreshTokenGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: LoginInputDto,
    @Req() request: RequestWithOptionalRefreshSession,
    @Res({ passthrough: true }) response: Response,
    @Headers('User-Agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.userAccountsClient.login({
      loginOrEmail: input.loginOrEmail,
      password: input.password,
      ip,
      deviceName: userAgent ?? 'unknown',
      currentSession: request.refreshTokenClaims,
    });

    this.setRefreshTokenCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh-token')
  @HttpCode(200)
  async refreshToken(
    @Req() request: RequestWithRefreshSession,
    @Res({ passthrough: true }) response: Response,
    @Headers('User-Agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.userAccountsClient.refreshToken({
      auth: request.refreshTokenClaims,
      ip,
      deviceName: userAgent ?? 'unknown',
    });

    this.setRefreshTokenCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
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
