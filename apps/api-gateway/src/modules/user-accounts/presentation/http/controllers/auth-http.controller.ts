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
  UnauthorizedException,
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
import type { CookieOptions, Request, Response } from 'express';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from 'openid-client';
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
import { ApiGoogleAuth } from '../swagger/auth/get/google-auth.swagger.js';
import { ApiGoogleAuthCallback } from '../swagger/auth/get/google-auth-callback.swagger.js';
import { frontendConfig } from '../../../../../config/frontend.config.js';
import {
  normalizeGithubIdentityClaims,
  normalizeGoogleIdentityClaims,
} from '../mappers/oauth-identity-claims.mapper.js';
import { googleOidcConfig } from '../../../config/google-oidc.config.js';
import { GOOGLE_OIDC_DISCOVERED_CONFIGURATION } from '../../../config/google-oidc-configuration.provider.js';

const GOOGLE_OIDC_TRANSACTION_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;
const GOOGLE_OIDC_STATE_COOKIE = 'googleOidcState';
const GOOGLE_OIDC_NONCE_COOKIE = 'googleOidcNonce';
const GOOGLE_OIDC_CODE_VERIFIER_COOKIE = 'googleOidcCodeVerifier';

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
    @Inject(googleOidcConfig.KEY)
    private readonly googleConfig: ConfigType<typeof googleOidcConfig>,
    @Inject(GOOGLE_OIDC_DISCOVERED_CONFIGURATION)
    private readonly googleOidcDiscoveredConfiguration: Configuration,
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

  @Public()
  @Get('google')
  @ApiGoogleAuth()
  async googleAuth(@Res() response: Response): Promise<void> {
    // state связывает начало входа с callback и защищает от OAuth CSRF (login CSRF),
    // при котором злоумышленник пытается завершить в браузере жертвы свою OAuth-транзакцию.
    const state = randomState();

    // nonce связывает запрос с будущим id_token и защищает от повторного использования старого токена
    // (replay attack): библиотека проверит, что токен содержит значение именно этой транзакции.
    const nonce = randomNonce();

    // codeVerifier — секрет PKCE, защищающий от перехвата authorization code: украденный code нельзя
    // обменять на токены без verifier. Он будет отправлен Google только на token endpoint.
    const codeVerifier = randomPKCECodeVerifier();

    // В authorization request отправляется только SHA-256-производная от codeVerifier. Получив codeVerifier
    // на token endpoint, Google повторно вычислит challenge и тем самым проверит получателя authorization code.
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const callbackUrl = new URL(this.googleConfig.callbackUrl);

    // authorization endpoint берётся из discovery metadata. openid-client также неявно добавляет
    // client_id из Configuration и response_type=code, если эти параметры не переданы явно.
    const authorizationUrl = buildAuthorizationUrl(this.googleOidcDiscoveredConfiguration, {
      redirect_uri: callbackUrl.href,
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const transactionCookieOptions: CookieOptions = {
      path: callbackUrl.pathname,
      httpOnly: true,
      secure: callbackUrl.protocol === 'https:',
      sameSite: 'lax',
      maxAge: GOOGLE_OIDC_TRANSACTION_COOKIE_MAX_AGE_MS,
    };

    // Callback — новый HTTP-запрос после перехода через Google. Cookies сохраняют исходные значения
    // до callback и привязывают его к тому же браузеру; HttpOnly не позволяет frontend-коду их прочитать.
    response.cookie(GOOGLE_OIDC_STATE_COOKIE, state, transactionCookieOptions);
    response.cookie(GOOGLE_OIDC_NONCE_COOKIE, nonce, transactionCookieOptions);
    response.cookie(GOOGLE_OIDC_CODE_VERIFIER_COOKIE, codeVerifier, transactionCookieOptions);
    response.redirect(302, authorizationUrl.href);
  }

  @Public()
  @Get('google/callback')
  @UseFilters(OauthRedirectExceptionFilter)
  @ApiGoogleAuthCallback()
  async googleAuthCallback(
    @Req() request: Request,
    @Res() response: Response,
    @Headers('User-Agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<void> {
    let identity: ReturnType<typeof normalizeGoogleIdentityClaims>;

    const callbackUrl = new URL(this.googleConfig.callbackUrl);
    // Для удаления transaction cookies важно повторить тот же path, с которым они были установлены:
    // иначе браузер сохранит старые state, nonce и PKCE verifier для следующих попыток входа.
    const transactionCookieOptions: CookieOptions = {
      path: callbackUrl.pathname,
      httpOnly: true,
      secure: callbackUrl.protocol === 'https:',
      sameSite: 'lax',
    };

    try {
      // Cookies приходят от клиента и поэтому остаются недоверенным runtime-вводом, несмотря на
      // известные имена. Пустые или нестроковые значения нельзя передавать в OIDC-проверки.
      const state: unknown = request.cookies?.[GOOGLE_OIDC_STATE_COOKIE];
      const nonce: unknown = request.cookies?.[GOOGLE_OIDC_NONCE_COOKIE];
      const codeVerifier: unknown = request.cookies?.[GOOGLE_OIDC_CODE_VERIFIER_COOKIE];

      if (
        typeof state !== 'string' ||
        !state ||
        typeof nonce !== 'string' ||
        !nonce ||
        typeof codeVerifier !== 'string' ||
        !codeVerifier
      ) {
        throw new UnauthorizedException('Google OIDC transaction cookie is missing');
      }

      // Берём из фактического callback только query-параметры Google (code/state/error). Origin и path
      // остаются из настроенного callback URL, зарегистрированного у провайдера, а не из HTTP-запроса.
      callbackUrl.search = new URL(request.originalUrl, callbackUrl.origin).search;

      // openid-client обменивает authorization code и связывает callback с начатой транзакцией:
      // сверяет state, передаёт Google PKCE verifier и проверяет nonce в полученном ID token.
      const googleTokens = await authorizationCodeGrant(this.googleOidcDiscoveredConfiguration, callbackUrl, {
        expectedState: state,
        expectedNonce: nonce,
        pkceCodeVerifier: codeVerifier,
      });

      // В прикладной слой передаются только claims уже проверенного ID token; mapper дополнительно
      // проверяет обязательные поля и приводит профиль Google к общему OAuth-контракту.
      identity = normalizeGoogleIdentityClaims(googleTokens.claims());
    } finally {
      // state, nonce и verifier одноразовые. Удаляем их и после успеха, и после любой ошибки,
      // чтобы callback нельзя было повторить и новая попытка входа не использовала старую транзакцию.
      response.clearCookie(GOOGLE_OIDC_STATE_COOKIE, transactionCookieOptions);
      response.clearCookie(GOOGLE_OIDC_NONCE_COOKIE, transactionCookieOptions);
      response.clearCookie(GOOGLE_OIDC_CODE_VERIFIER_COOKIE, transactionCookieOptions);
    }

    // Связывание OAuth identity с пользователем и создание сессии принадлежат User Accounts;
    // Gateway передаёт туда нормализованный профиль и контекст текущего клиентского устройства.
    const sessionTokens = await firstValueFrom(
      this.authClient.authenticateOAuth({
        identity,
        ip,
        deviceName: userAgent ?? 'unknown',
      }),
    );

    this.setRefreshTokenCookie(response, sessionTokens.refreshToken);
    response.redirect(302, new URL('/', this.frontend.baseUrl).toString());
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
