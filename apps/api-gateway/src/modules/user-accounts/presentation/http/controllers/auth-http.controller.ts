import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Ip,
  type OnModuleInit,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import {
  AUTH_SERVICE_NAME,
  type AuthServiceClient,
  PASSWORD_RESET_SERVICE_NAME,
  type PasswordResetServiceClient,
  REGISTRATION_SERVICE_NAME,
  type RegistrationServiceClient,
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  SESSIONS_SERVICE_NAME,
  type SessionsServiceClient,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import { userAccountsHttpConfig } from '../../../config/user-accounts-http.config.js';
import type {
  RequestWithOAuthIdentityClaims,
  RequestWithOptionalRefreshSession,
  RequestWithRefreshSession,
} from '../auth-request.types.js';
import { LoginDto } from '../dto/input/login.dto.js';
import { AccessTokenResponseDto } from '../dto/output/access-token-response.dto.js';
import { OptionalRefreshTokenGuard } from '../guards/optional-refresh-token.guard.js';
import { RefreshTokenGuard } from '../guards/refresh-token.guard.js';
import { PasswordResetDto } from '../dto/input/password-reset.dto.js';
import { PasswordResetResponse } from '../dto/output/password-reset.response.dto.js';
import { ConfirmPasswordResetDto } from '../dto/input/confirm-password-reset.dto.js';
import { RegistrationDto } from '../dto/input/registration.dto.js';
import { ConfirmRegistrationDto } from '../dto/input/confirm-registration.dto.js';
import { ResendRegistrationConfirmationDto } from '../dto/input/resend-registration-confirmation.dto.js';
import { ConfirmPasswordResetResponseDto } from '../dto/output/confirm-password-reset-response.dto.js';
import { RecaptchaVerifiersService } from '../../captcha/recaptcha-verifiers.service.ts';
import { ApiAuthController } from '../swagger/auth/auth-controller.swagger.js';
import { ApiLogin } from '../swagger/auth/post/login.swagger.js';
import { ApiLogout } from '../swagger/auth/post/logout.swagger.js';
import { ApiRefreshToken } from '../swagger/auth/post/refresh-token.swagger.js';
import { ApiConfirmPasswordReset } from '../swagger/password-reset/post/confirm-password-reset.swagger.js';
import { ApiRequestPasswordReset } from '../swagger/password-reset/post/request-password-reset.swagger.js';
import { ApiConfirmRegistration } from '../swagger/registration/post/confirm-registration.swagger.js';
import { ApiRegister } from '../swagger/registration/post/register.swagger.js';
import { ApiResendRegistrationConfirmation } from '../swagger/registration/post/resend-registration-confirmation.swagger.js';
import { GithubAuthGuard } from '../guards/github/github-auth.guard.js';
import { OauthRedirectExceptionFilter } from '../../../../../common/http/filters/oauth-redirect-exception.filter.ts';
import { ApiGithubAuth } from '../swagger/auth/get/github-auth.swagger.js';
import { ApiGithubAuthCallback } from '../swagger/auth/get/github-auth-callback.swagger.js';
import { frontendConfig } from '../../../../../config/frontend.config.js';
import { normalizeGithubIdentityClaims } from '../mappers/oauth-identity-claims.mapper.js';

@ApiAuthController()
@Controller('auth')
export class AuthHttpController implements OnModuleInit {
  private authClient!: AuthServiceClient;
  private registrationClient!: RegistrationServiceClient;
  private passResetClient!: PasswordResetServiceClient;
  private sessionsClient!: SessionsServiceClient;

  constructor(
    @Inject(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
    @Inject(userAccountsHttpConfig.KEY)
    private readonly config: ConfigType<typeof userAccountsHttpConfig>,
    @Inject(frontendConfig.KEY)
    private readonly frontend: ConfigType<typeof frontendConfig>,
    private readonly recaptchaVerifiersService: RecaptchaVerifiersService,
  ) {}

  onModuleInit(): void {
    this.authClient = this.grpcClient.getService<AuthServiceClient>(AUTH_SERVICE_NAME);
    this.registrationClient =
      this.grpcClient.getService<RegistrationServiceClient>(REGISTRATION_SERVICE_NAME);
    this.passResetClient =
      this.grpcClient.getService<PasswordResetServiceClient>(PASSWORD_RESET_SERVICE_NAME);
    this.sessionsClient = this.grpcClient.getService<SessionsServiceClient>(SESSIONS_SERVICE_NAME);
  }

  @Public()
  @Post('registration')
  @HttpCode(201)
  @ApiRegister()
  async register(@Body() input: RegistrationDto): Promise<void> {
    await firstValueFrom(
      this.registrationClient.registerUser({
        username: input.username,
        email: input.email,
        password: input.password,
      }),
    );
  }

  @Public()
  @Post('registration/confirmation')
  @HttpCode(204)
  @ApiConfirmRegistration()
  async confirmRegistration(@Body() input: ConfirmRegistrationDto): Promise<void> {
    await firstValueFrom(this.registrationClient.confirmRegistration({ code: input.code }));
  }

  @Public()
  @Post('registration/resend-confirmation')
  @HttpCode(204)
  @ApiResendRegistrationConfirmation()
  async resendRegistrationConfirmation(@Body() input: ResendRegistrationConfirmationDto): Promise<void> {
    await firstValueFrom(this.registrationClient.resendRegistrationConfirmation({ email: input.email }));
  }

  @Public()
  @UseGuards(OptionalRefreshTokenGuard)
  @Post('login')
  @HttpCode(200)
  @ApiLogin()
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
  @ApiRefreshToken()
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
  @HttpCode(202)
  @ApiRequestPasswordReset()
  async passwordReset(@Body() inputDto: PasswordResetDto): Promise<PasswordResetResponse> {
    const result = await this.recaptchaVerifiersService.verify(inputDto.recaptchaToken);
    if (!result.success) {
      throw new BadRequestException('reCAPTCHA validation failed');
    }
    await firstValueFrom(this.passResetClient.requestPasswordReset({ email: inputDto.email }));
    return new PasswordResetResponse();
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(200)
  @ApiConfirmPasswordReset()
  async confirmPasswordReset(
    @Body() inputDto: ConfirmPasswordResetDto,
  ): Promise<ConfirmPasswordResetResponseDto> {
    await firstValueFrom(this.passResetClient.confirmPasswordReset(inputDto));
    return new ConfirmPasswordResetResponseDto();
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('logout')
  @HttpCode(204)
  @ApiLogout()
  async logout(
    @Req() request: RequestWithRefreshSession,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await firstValueFrom(this.sessionsClient.logoutCurrentSession({ auth: request.refreshTokenClaims }));
    this.clearRefreshTokenCookie(response);
  }

  // Navigating here redirects the user to GitHub
  @Public()
  @Get('github')
  @UseGuards(GithubAuthGuard)
  @ApiGithubAuth()
  async githubAuth() {
    // With `@UseGuards(GithubOauthGuard)` we are using an AuthGuard that @nestjs/passport
    // automatically provisioned for us when we extended the passport-github strategy.
    // The Guard initiates the passport-github flow.
  }

  // GitHub redirects back here after authentication
  @Public()
  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  @UseFilters(OauthRedirectExceptionFilter)
  @ApiGithubAuthCallback()
  async githubAuthRedirect(
    @Req() request: RequestWithOAuthIdentityClaims,
    @Res() response: Response,
    @Headers('User-Agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<void> {
    const identity = normalizeGithubIdentityClaims(request.user);
    const tokens = await firstValueFrom(
      this.authClient.authenticateOAuth({
        identity: {
          provider: identity.provider,
          subject: identity.subject,
          emails: identity.emails,
          username: identity.username,
          avatarUrl: identity.avatarUrl,
        },
        ip: ip,
        deviceName: userAgent ?? 'unknown',
      }),
    );
    this.setRefreshTokenCookie(response, tokens.refreshToken);
    response.redirect(302, new URL('/', this.frontend.baseUrl).toString());
  }

  private setRefreshTokenCookie(response: Response, refreshToken: string): void {
    response.cookie('refreshToken', refreshToken, {
      maxAge: this.config.refreshTokenCookieMaxAgeMs,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });
  }

  private clearRefreshTokenCookie(response: Response): void {
    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });
  }
}
