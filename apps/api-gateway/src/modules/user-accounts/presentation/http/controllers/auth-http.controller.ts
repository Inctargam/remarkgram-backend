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
  REGISTRATION_SERVICE_NAME,
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  type AuthServiceClient,
  PasswordResetServiceClient,
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  SESSIONS_SERVICE_NAME,
  SessionsServiceClient,
  PASSWORD_RESET_SERVICE_NAME,
  type RegistrationServiceClient,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  ApiAcceptedResponse,
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { ApiErrorResponseDto } from '../../../../../common/http/api-error-response.dto.js';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import { ValidationErrorResponseDto } from '../../../../../common/http/validation-error-response.dto.js';
import { userAccountsHttpConfig } from '../../../config/user-accounts-http.config.js';
import type { RequestWithOptionalRefreshSession, RequestWithRefreshSession } from '../auth-request.types.js';
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

@ApiTags('Auth')
@ApiExtraModels(ApiErrorResponseDto, ValidationErrorResponseDto)
@ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' })
@ApiServiceUnavailableResponse({ description: 'The user-accounts service is unavailable.' })
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
  @ApiOperation({ summary: 'Register a user and send an email confirmation link' })
  @ApiCreatedResponse({ description: 'The user was registered and the confirmation email was sent.' })
  @ApiBadRequestResponse({ description: 'The request body is invalid.', type: ValidationErrorResponseDto })
  @ApiResponse({
    status: 409,
    description: 'The username or email is already reserved.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
        examples: {
          usernameAlreadyExists: {
            summary: 'Username is already reserved',
            value: {
              statusCode: 409,
              code: 'USERNAME_ALREADY_EXISTS',
              message: 'Username already exists',
            },
          },
          emailAlreadyExists: {
            summary: 'Email is already reserved',
            value: {
              statusCode: 409,
              code: 'EMAIL_ALREADY_EXISTS',
              message: 'Email already exists',
            },
          },
        },
      },
    },
  })
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
  @ApiOperation({ summary: 'Confirm registration using the code from the email link' })
  @ApiNoContentResponse({ description: 'The email was confirmed.' })
  @ApiResponse({
    status: 400,
    description: 'The request body or confirmation code is invalid.',
    content: {
      'application/json': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(ApiErrorResponseDto) },
            { $ref: getSchemaPath(ValidationErrorResponseDto) },
          ],
        },
        examples: {
          validationError: {
            summary: 'Request validation failed',
            value: {
              statusCode: 400,
              message: ['code should not be empty'],
              error: 'Bad Request',
            },
          },
          invalidConfirmationCode: {
            summary: 'Confirmation code is invalid, expired, replaced or already used',
            value: {
              statusCode: 400,
              code: 'INVALID_CONFIRMATION_CODE',
              message: 'Confirmation code is invalid',
            },
          },
        },
      },
    },
  })
  async confirmRegistration(@Body() input: ConfirmRegistrationDto): Promise<void> {
    await firstValueFrom(this.registrationClient.confirmRegistration({ code: input.code }));
  }

  @Public()
  @Post('registration/resend-confirmation')
  @HttpCode(204)
  @ApiOperation({ summary: 'Send a new registration confirmation link' })
  @ApiNoContentResponse({ description: 'A new confirmation email was sent when resending was applicable.' })
  @ApiResponse({
    status: 400,
    description: 'The email is malformed or does not belong to a user.',
    content: {
      'application/json': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(ApiErrorResponseDto) },
            { $ref: getSchemaPath(ValidationErrorResponseDto) },
          ],
        },
        examples: {
          validationError: {
            summary: 'Email format is invalid',
            value: {
              statusCode: 400,
              message: ['email must be an email'],
              error: 'Bad Request',
            },
          },
          incorrectEmail: {
            summary: 'Email does not belong to a user',
            value: {
              statusCode: 400,
              code: 'INCORRECT_EMAIL',
              message: 'Email is incorrect',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'The email is already confirmed.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
        examples: {
          emailAlreadyConfirmed: {
            summary: 'Email is already confirmed',
            value: {
              statusCode: 409,
              code: 'EMAIL_ALREADY_CONFIRMED',
              message: 'Email is already confirmed',
            },
          },
        },
      },
    },
  })
  async resendRegistrationConfirmation(@Body() input: ResendRegistrationConfirmationDto): Promise<void> {
    await firstValueFrom(this.registrationClient.resendRegistrationConfirmation({ email: input.email }));
  }

  @Public()
  @UseGuards(OptionalRefreshTokenGuard)
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log in',
    description: 'Returns an access token and stores the refresh token in an httpOnly cookie.',
  })
  @ApiOkResponse({ description: 'Authentication succeeded.', type: AccessTokenResponseDto })
  @ApiBadRequestResponse({ description: 'The request body is invalid.', type: ValidationErrorResponseDto })
  @ApiResponse({
    status: 401,
    description: 'The email or password is incorrect.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
        examples: {
          incorrectCredentials: {
            summary: 'Credentials are incorrect',
            value: {
              statusCode: 401,
              code: 'INCORRECT_CREDENTIALS',
              message: 'Incorrect email/password',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'The email is not confirmed or the session is already active.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
        examples: {
          emailNotConfirmed: {
            summary: 'Email is not confirmed',
            value: {
              statusCode: 409,
              code: 'EMAIL_NOT_CONFIRMED',
              message: 'Email has not been confirmed',
            },
          },
          userAlreadyLoggedIn: {
            summary: 'The supplied refresh cookie belongs to an active session',
            value: {
              statusCode: 409,
              code: 'USER_ALREADY_LOGGED_IN',
              message: 'The user is already logged in',
            },
          },
        },
      },
    },
  })
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
  @ApiCookieAuth('refreshToken')
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description: 'Returns a new access token and replaces the refresh token cookie.',
  })
  @ApiOkResponse({ description: 'The token pair was rotated.', type: AccessTokenResponseDto })
  @ApiResponse({
    status: 401,
    description: 'The refresh token or its session is invalid.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
        examples: {
          noActiveSession: {
            summary: 'The refresh token is not linked to an active session',
            value: {
              statusCode: 401,
              code: 'NO_ACTIVE_SESSION',
              message: 'No active session found',
            },
          },
        },
      },
    },
  })
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
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiAcceptedResponse({
    description: 'The request was accepted without revealing whether the email exists.',
    type: PasswordResetResponse,
  })
  @ApiBadRequestResponse({ description: 'The email is invalid.', type: ValidationErrorResponseDto })
  async passwordReset(@Body() inputDto: PasswordResetDto): Promise<PasswordResetResponse> {
    await firstValueFrom(this.passResetClient.requestPasswordReset(inputDto));
    return new PasswordResetResponse();
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set a new password using a password reset token' })
  @ApiOkResponse({
    description: 'The password was changed and active sessions were revoked.',
    type: ConfirmPasswordResetResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'The reset token or new password is invalid.',
    content: {
      'application/json': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(ApiErrorResponseDto) },
            { $ref: getSchemaPath(ValidationErrorResponseDto) },
          ],
        },
        examples: {
          validationError: {
            summary: 'The new password does not satisfy the password policy',
            value: {
              statusCode: 400,
              message: ['newPassword must be longer than or equal to 6 characters'],
              error: 'Bad Request',
            },
          },
          invalidPasswordResetToken: {
            summary: 'The reset link is invalid, expired, revoked or already used',
            value: {
              statusCode: 400,
              code: 'INVALID_PASSWORD_RESET_TOKEN',
              message: 'Reset link is invalid or expired.',
            },
          },
        },
      },
    },
  })
  async confirmPasswordReset(
    @Body() inputDto: ConfirmPasswordResetDto,
  ): Promise<ConfirmPasswordResetResponseDto> {
    await firstValueFrom(this.passResetClient.confirmPasswordReset(inputDto));
    return new ConfirmPasswordResetResponseDto();
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
