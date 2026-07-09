import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import {
  FILES_SERVICE_NAME,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type FilesServiceClient,
} from '@app/files-grpc';
import {
  AUTH_SERVICE_NAME,
  PASSWORD_RESET_SERVICE_NAME,
  REGISTRATION_SERVICE_NAME,
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  SESSIONS_SERVICE_NAME,
  TESTING_SERVICE_NAME,
  USERS_SERVICE_NAME,
  USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY,
  type AuthServiceClient,
  type PasswordResetServiceClient,
  type RegistrationServiceClient,
  type SessionsServiceClient,
  type TestingServiceClient,
  type UsersServiceClient,
} from '@app/user-accounts-grpc';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import { ApiGatewayModule } from './../src/api-gateway.module.js';
import {
  RecaptchaVerificationReason,
  RecaptchaVerifiersService,
} from './../src/modules/user-accounts/presentation/captcha/recaptcha-verifiers.service.js';
import { API_PREFIX, SWAGGER_PATH } from './../src/http-api.constants.js';
import { setupSwagger } from './../src/swagger.js';

type SupertestApp = Parameters<typeof request>[0];
const apiPath = (path: `/${string}`): string => `/${API_PREFIX}${path}`;

describe('ApiGateway (e2e)', () => {
  const testingEndpointKey = 'testing-key-with-at-least-32-characters';
  let app: INestApplication;
  const filesServiceClient = {
    uploadFile: vi.fn<FilesServiceClient['uploadFile']>(),
  };
  const usersServiceClient = {
    getUsers: vi.fn<UsersServiceClient['getUsers']>(),
  };
  const authServiceClient = {
    login: vi.fn<AuthServiceClient['login']>(),
    refreshToken: vi.fn<AuthServiceClient['refreshToken']>(),
  };
  const registrationServiceClient = {
    registerUser: vi.fn<RegistrationServiceClient['registerUser']>(),
    confirmRegistration: vi.fn<RegistrationServiceClient['confirmRegistration']>(),
    resendRegistrationConfirmation: vi.fn<RegistrationServiceClient['resendRegistrationConfirmation']>(),
  };
  const sessionsServiceClient = {
    getSessions: vi.fn<SessionsServiceClient['getSessions']>(),
    logoutCurrentSession: vi.fn<SessionsServiceClient['logoutCurrentSession']>(),
    revokeSession: vi.fn<SessionsServiceClient['revokeSession']>(),
    revokeOtherSessions: vi.fn<SessionsServiceClient['revokeOtherSessions']>(),
  };
  const testingServiceClient = {
    deleteAllData: vi.fn<TestingServiceClient['deleteAllData']>(),
  };
  const passwordResetServiceClient = {
    requestPasswordReset: vi.fn<PasswordResetServiceClient['requestPasswordReset']>(),
    confirmPasswordReset: vi.fn<PasswordResetServiceClient['confirmPasswordReset']>(),
  };
  const recaptchaVerifiersService = {
    verify: vi.fn<RecaptchaVerifiersService['verify']>(),
  };
  const filesGrpcClient = {
    getService: vi.fn(() => filesServiceClient),
  };
  const userAccountsGrpcClient = {
    getService: vi.fn((serviceName: string) => {
      switch (serviceName) {
        case USERS_SERVICE_NAME:
          return usersServiceClient;
        case AUTH_SERVICE_NAME:
          return authServiceClient;
        case REGISTRATION_SERVICE_NAME:
          return registrationServiceClient;
        case SESSIONS_SERVICE_NAME:
          return sessionsServiceClient;
        case TESTING_SERVICE_NAME:
          return testingServiceClient;
        case PASSWORD_RESET_SERVICE_NAME:
          return passwordResetServiceClient;
        default:
          throw new Error(`Unknown user accounts gRPC service: ${serviceName}`);
      }
    }),
  };
  const jwtService = { verifyAsync: vi.fn() };
  const refreshTokenClaims = {
    userId: '1',
    sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
    jti: 'current-jti',
  };

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'testing');
    vi.stubEnv('GATEWAY_PORT', '0');
    vi.stubEnv('FILES_GRPC_URL', 'localhost:50051');
    vi.stubEnv('USER_ACCOUNTS_GRPC_URL', 'localhost:50052');
    vi.stubEnv('JWT_PUBLIC_KEY', 'public-key');
    vi.stubEnv('REFRESH_TOKEN_COOKIE_MAX_AGE_MS', '1200000');
    vi.stubEnv('ENABLE_TESTING_ENDPOINTS', 'true');
    vi.stubEnv('TESTING_ENDPOINT_KEY', testingEndpointKey);
    vi.stubEnv('GOOGLE_RECAPTCHA_SECRET_KEY', 'test-recaptcha-secret-key');
    filesServiceClient.uploadFile.mockReturnValue(of({ id: 'file-id' }));
    jwtService.verifyAsync.mockResolvedValue({
      sub: refreshTokenClaims.userId,
      sessionId: refreshTokenClaims.sessionId,
      jti: refreshTokenClaims.jti,
    });
    usersServiceClient.getUsers.mockReturnValue(
      of({
        users: [{ id: 1, username: 'user', email: 'user@example.com' }],
      }),
    );
    authServiceClient.login.mockReturnValue(
      of({
        accessToken: 'login-access-token',
        refreshToken: 'login-refresh-token',
      }),
    );
    authServiceClient.refreshToken.mockReturnValue(
      of({
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
      }),
    );
    registrationServiceClient.registerUser.mockReturnValue(of({}));
    registrationServiceClient.confirmRegistration.mockReturnValue(of({}));
    registrationServiceClient.resendRegistrationConfirmation.mockReturnValue(of({}));
    sessionsServiceClient.getSessions.mockReturnValue(
      of({
        sessions: [
          {
            ip: '127.0.0.1',
            deviceName: 'Browser',
            lastActiveAt: '2026-07-01T12:00:00.000Z',
            sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
            isCurrent: true,
          },
        ],
      }),
    );
    sessionsServiceClient.logoutCurrentSession.mockReturnValue(of({}));
    sessionsServiceClient.revokeSession.mockReturnValue(of({}));
    sessionsServiceClient.revokeOtherSessions.mockReturnValue(of({}));
    testingServiceClient.deleteAllData.mockReturnValue(of({}));
    passwordResetServiceClient.requestPasswordReset.mockReturnValue(of({ accepted: true }));
    passwordResetServiceClient.confirmPasswordReset.mockReturnValue(of({}));
    recaptchaVerifiersService.verify.mockResolvedValue({
      success: true,
      reason: RecaptchaVerificationReason.ValidToken,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiGatewayModule],
    })
      .overrideProvider(REMARKGRAM_FILES_V1_PACKAGE_NAME)
      .useValue(filesGrpcClient)
      .overrideProvider(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME)
      .useValue(userAccountsGrpcClient)
      .overrideProvider(JwtService)
      .useValue(jwtService)
      .overrideProvider(RecaptchaVerifiersService)
      .useValue(recaptchaVerifiersService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.setGlobalPrefix(API_PREFIX);
    setupSwagger(app);
    await app.init();
  });

  it('GET /api/v1/docs-json exposes the implemented HTTP API', async () => {
    const response = await request(app.getHttpServer() as SupertestApp)
      .get(`/${SWAGGER_PATH}-json`)
      .expect(200);
    const document = response.body as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/auth/registration',
        '/auth/registration/confirmation',
        '/auth/registration/resend-confirmation',
        '/auth/login',
        '/auth/refresh-token',
        '/auth/logout',
        '/auth/password-reset/request',
        '/auth/password-reset/confirm',
        '/security/sessions',
        '/security/sessions/{sessionId}',
        '/testing/all-data',
      ].map(apiPath)),
    );
    expect(document.paths).not.toHaveProperty(apiPath('/auth/sessions'));
    expect(document.paths).not.toHaveProperty(apiPath('/auth/sessions/current'));
    expect(document.paths).not.toHaveProperty(apiPath('/auth/sessions/others'));
    expect(document.paths).not.toHaveProperty(apiPath('/users'));
    expect(document.paths).not.toHaveProperty(apiPath('/files'));
    expect(document.components.schemas.SessionResponseDto?.properties).toEqual(
      expect.objectContaining({
        sessionId: expect.any(Object),
        deviceName: expect.any(Object),
        ip: expect.any(Object),
        lastActiveAt: expect.any(Object),
        isCurrent: expect.any(Object),
      }),
    );
    expect(document.components.schemas).not.toHaveProperty('DeviceResponseDto');

    type OpenApiResponse = {
      content?: {
        'application/json'?: {
          examples?: Record<string, { value: Record<string, unknown> }>;
        };
      };
    };
    type OpenApiOperation = { responses: Record<string, OpenApiResponse> };
    const passwordResetConfirmation = document.paths[apiPath('/auth/password-reset/confirm')] as {
      post: OpenApiOperation;
    };
    const registrationConfirmation = document.paths[apiPath('/auth/registration/confirmation')] as {
      post: OpenApiOperation;
    };
    const deleteSession = document.paths[apiPath('/security/sessions/{sessionId}')] as {
      delete: OpenApiOperation;
    };

    expect(
      passwordResetConfirmation.post.responses['400'].content?.['application/json']?.examples
        ?.invalidPasswordResetToken?.value,
    ).toEqual({
      statusCode: 400,
      code: 'INVALID_PASSWORD_RESET_TOKEN',
      message: 'Reset link is invalid or expired.',
    });
    expect(registrationConfirmation.post.responses).not.toHaveProperty('409');
    expect(deleteSession.delete.responses).not.toHaveProperty('403');
    expect(document.components.schemas.ApiErrorResponseDto?.properties?.statusCode).not.toHaveProperty(
      'example',
    );
  });

  it('DELETE /testing/all-data clears user-accounts data', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .delete(apiPath('/testing/all-data'))
      .set('X-Testing-Key', testingEndpointKey)
      .expect(204);

    expect(testingServiceClient.deleteAllData).toHaveBeenCalledWith({});
  });

  it('POST /files', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/files'))
      .expect(201)
      .expect({ id: 'file-id' });

    expect(filesServiceClient.uploadFile).toHaveBeenCalledWith({
      originalFilename: 'supper-name-files.png',
    });
    expect(filesGrpcClient.getService).toHaveBeenCalledWith(FILES_SERVICE_NAME);
  });

  it('GET /users delegates to user-accounts over gRPC', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .get(apiPath('/users'))
      .expect(200)
      .expect([{ id: 1, username: 'user', email: 'user@example.com' }]);

    expect(usersServiceClient.getUsers).toHaveBeenCalledOnce();
  });

  it('maps user-accounts gRPC errors to HTTP errors', async () => {
    usersServiceClient.getUsers.mockReturnValueOnce(
      throwError(() => ({
        code: status.UNAUTHENTICATED,
        details: 'Authentication failed',
      })),
    );

    const response = await request(app.getHttpServer() as SupertestApp)
      .get(apiPath('/users'))
      .expect(401);
    const body = response.body as { code: string; message: string };

    expect(body.message).toBe('Authentication failed');
    expect(body.code).toBe('UNAUTHENTICATED');
  });

  it('preserves user-accounts error codes while mapping gRPC status to HTTP', async () => {
    const metadata = new Metadata();
    metadata.set(USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY, 'EMAIL_NOT_CONFIRMED');
    usersServiceClient.getUsers.mockReturnValueOnce(
      throwError(() => ({
        code: status.FAILED_PRECONDITION,
        details: 'Email has not been confirmed',
        metadata,
      })),
    );

    await request(app.getHttpServer() as SupertestApp)
      .get(apiPath('/users'))
      .expect(409)
      .expect({
        statusCode: 409,
        code: 'EMAIL_NOT_CONFIRMED',
        message: 'Email has not been confirmed',
      });
  });

  it('POST /auth/login delegates credentials and stores the refresh token in a cookie', async () => {
    const response = await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/auth/login'))
      .set('User-Agent', 'Browser')
      .send({ email: 'user@example.com', password: 'password' })
      .expect(200)
      .expect({ accessToken: 'login-access-token' });

    expect(response.headers['set-cookie']).toBeDefined();
    expect(authServiceClient.login).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        password: 'password',
        deviceName: 'Browser',
      }),
    );
  });

  it('POST /auth/registration delegates validated registration data', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/auth/registration'))
      .send({
        username: 'user_123',
        email: 'user@example.com',
        password: 'Password1!',
      })
      .expect(201);

    expect(registrationServiceClient.registerUser).toHaveBeenCalledWith({
      username: 'user_123',
      email: 'user@example.com',
      password: 'Password1!',
    });
  });

  it('POST /auth/registration/confirmation delegates a confirmation code', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/auth/registration/confirmation'))
      .send({ code: 'confirmation-code' })
      .expect(204);

    expect(registrationServiceClient.confirmRegistration).toHaveBeenCalledWith({
      code: 'confirmation-code',
    });
  });

  it('POST /auth/registration/resend-confirmation delegates an email', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/auth/registration/resend-confirmation'))
      .send({ email: 'user@example.com' })
      .expect(204);

    expect(registrationServiceClient.resendRegistrationConfirmation).toHaveBeenCalledWith({
      email: 'user@example.com',
    });
  });

  it('POST /auth/refresh-token delegates the cookie to user-accounts', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/auth/refresh-token'))
      .set('Cookie', 'refreshToken=current-refresh-token')
      .set('User-Agent', 'Browser')
      .expect(200)
      .expect({ accessToken: 'rotated-access-token' });

    expect(authServiceClient.refreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: refreshTokenClaims,
        deviceName: 'Browser',
      }),
    );
  });

  it('POST /auth/password-reset/request delegates email to user-accounts', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/auth/password-reset/request'))
      .send({ email: 'user@example.com', recaptchaToken: 'recaptcha-reset-token' })
      .expect(202)
      .expect({ message: 'If this email exists, password reset instructions were sent.' });

    expect(recaptchaVerifiersService.verify).toHaveBeenCalledWith('recaptcha-reset-token');
    expect(passwordResetServiceClient.requestPasswordReset).toHaveBeenCalledWith({
      email: 'user@example.com',
    });
  });

  it('POST /auth/password-reset/confirm delegates token and new password to user-accounts', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/auth/password-reset/confirm'))
      .send({ token: 'raw-reset-token', newPassword: 'Newpass1' })
      .expect(200)
      .expect({ message: 'Password has been changed successfully.' });

    expect(passwordResetServiceClient.confirmPasswordReset).toHaveBeenCalledWith({
      token: 'raw-reset-token',
      newPassword: 'Newpass1',
    });
  });

  it('rejects refresh without a cookie as an HTTP authentication error', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/auth/refresh-token'))
      .expect(401);
  });

  it('rejects a refresh token with an invalid signature before calling user-accounts', async () => {
    jwtService.verifyAsync.mockRejectedValueOnce(new Error('invalid signature'));

    await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/auth/refresh-token'))
      .set('Cookie', 'refreshToken=invalid-refresh-token')
      .expect(401);

    expect(authServiceClient.refreshToken).not.toHaveBeenCalled();
  });

  it('GET /security/sessions delegates the refresh token to user-accounts', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .get(apiPath('/security/sessions'))
      .set('Cookie', 'refreshToken=current-refresh-token')
      .expect(200)
      .expect([
        {
          ip: '127.0.0.1',
          deviceName: 'Browser',
          lastActiveAt: '2026-07-01T12:00:00.000Z',
          sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
          isCurrent: true,
        },
      ]);

    expect(sessionsServiceClient.getSessions).toHaveBeenCalledWith({
      auth: refreshTokenClaims,
    });
  });

  it('POST /auth/logout logs out the current session and clears the cookie', async () => {
    const response = await request(app.getHttpServer() as SupertestApp)
      .post(apiPath('/auth/logout'))
      .set('Cookie', 'refreshToken=current-refresh-token')
      .expect(204);

    expect(sessionsServiceClient.logoutCurrentSession).toHaveBeenCalledWith({
      auth: refreshTokenClaims,
    });
    expect(response.headers['set-cookie']?.[0]).toContain('refreshToken=;');
  });

  it('DELETE /security/sessions/:sessionId revokes the selected session', async () => {
    const sessionId = '7a63d7e0-9ae7-4e5b-84e4-d770bdb5ef92';

    await request(app.getHttpServer() as SupertestApp)
      .delete(apiPath(`/security/sessions/${sessionId}`))
      .set('Cookie', 'refreshToken=current-refresh-token')
      .expect(204);

    expect(sessionsServiceClient.revokeSession).toHaveBeenCalledWith({
      auth: refreshTokenClaims,
      sessionId,
    });
  });

  it('DELETE /security/sessions revokes all sessions except the current one', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .delete(apiPath('/security/sessions'))
      .set('Cookie', 'refreshToken=current-refresh-token')
      .expect(204);

    expect(sessionsServiceClient.revokeOtherSessions).toHaveBeenCalledWith({
      auth: refreshTokenClaims,
    });
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
});
