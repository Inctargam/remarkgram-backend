import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Ip,
  type OnModuleInit,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import {
  AUTH_SERVICE_NAME,
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  type AuthServiceClient,
  PasswordResetServiceClient,
  PASSWORD_RESET_SERVICE_NAME,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import { userAccountsHttpConfig } from '../../../config/user-accounts-http.config.js';
import type { RequestWithOptionalRefreshSession, RequestWithRefreshSession } from '../auth-request.types.js';
import { LoginDto } from '../dto/input/login.dto.js';
import { AccessTokenResponseDto } from '../dto/output/access-token-response.dto.js';
import { OptionalRefreshTokenGuard } from '../guards/optional-refresh-token.guard.js';
import { RefreshTokenGuard } from '../guards/refresh-token.guard.js';
import { PasswordResetDto } from '../dto/input/password-reset.dto.js';
import { PasswordResetResponse } from '../dto/output/password-reset.response.dto.js';
import { ConfirmPasswordResetDto } from '../dto/input/confirm-password-reset.dto.js';

@Controller('auth')
export class AuthHttpController implements OnModuleInit {
  private authClient!: AuthServiceClient;
  private passResetClient!: PasswordResetServiceClient;

  constructor(
    @Inject(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
    @Inject(userAccountsHttpConfig.KEY)
    private readonly config: ConfigType<typeof userAccountsHttpConfig>,
  ) {}

  onModuleInit(): void {
    this.authClient = this.grpcClient.getService<AuthServiceClient>(AUTH_SERVICE_NAME);
    this.passResetClient =
      this.grpcClient.getService<PasswordResetServiceClient>(PASSWORD_RESET_SERVICE_NAME);
  }

  @Public()
  @UseGuards(OptionalRefreshTokenGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: LoginDto,
    @Req() request: RequestWithOptionalRefreshSession,
    @Res({ passthrough: true }) response: Response,
    @Headers('User-Agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<AccessTokenResponseDto> {
    const tokens = await firstValueFrom(
      this.authClient.login({
        email: input.email,
        password: input.password,
        ip,
        deviceName: userAgent ?? 'unknown',
        currentSession: request.refreshTokenClaims,
      }),
    );

    this.setRefreshTokenCookie(response, tokens.refreshToken);
    return new AccessTokenResponseDto(tokens.accessToken);
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
  ): Promise<AccessTokenResponseDto> {
    const tokens = await firstValueFrom(
      this.authClient.refreshToken({
        auth: request.refreshTokenClaims,
        ip,
        deviceName: userAgent ?? 'unknown',
      }),
    );

    this.setRefreshTokenCookie(response, tokens.refreshToken);
    return new AccessTokenResponseDto(tokens.accessToken);
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(200)
  async passwordReset(@Body() inputDto: PasswordResetDto): Promise<PasswordResetResponse> {
    await firstValueFrom(this.passResetClient.requestPasswordReset(inputDto));
    return new PasswordResetResponse();
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(200)
  async confirmPasswordReset(@Body() inputDto: ConfirmPasswordResetDto): Promise<{ message: string }> {
    await firstValueFrom(this.passResetClient.confirmPasswordReset(inputDto));
    return {
      message: 'Password has been changed successfully.',
    };
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
