import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
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
  USERS_SERVICE_NAME,
  type AuthServiceClient,
  type PasswordResetServiceClient,
  type RegistrationServiceClient,
  type SessionsServiceClient,
  type UsersServiceClient,
} from '@app/user-accounts-grpc';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import { ApiGatewayModule } from './../src/api-gateway.module.js';

type SupertestApp = Parameters<typeof request>[0];

describe('ApiGateway (e2e)', () => {
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
    getDevices: vi.fn<SessionsServiceClient['getDevices']>(),
  };
  const passwordResetServiceClient = {
    requestPasswordReset: vi.fn<PasswordResetServiceClient['requestPasswordReset']>(),
    confirmPasswordReset: vi.fn<PasswordResetServiceClient['confirmPasswordReset']>(),
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
    sessionsServiceClient.getDevices.mockReturnValue(
      of({
        devices: [
          {
            ip: '127.0.0.1',
            title: 'Browser',
            lastActiveDate: '2026-07-01T12:00:00.000Z',
            deviceId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
          },
        ],
      }),
    );
    passwordResetServiceClient.requestPasswordReset.mockReturnValue(of({ accepted: true }));
    passwordResetServiceClient.confirmPasswordReset.mockReturnValue(of({}));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiGatewayModule],
    })
      .overrideProvider(REMARKGRAM_FILES_V1_PACKAGE_NAME)
      .useValue(filesGrpcClient)
      .overrideProvider(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME)
      .useValue(userAccountsGrpcClient)
      .overrideProvider(JwtService)
      .useValue(jwtService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  it('POST /files', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post('/files')
      .expect(201)
      .expect({ id: 'file-id' });

    expect(filesServiceClient.uploadFile).toHaveBeenCalledWith({
      originalFilename: 'supper-name-files.png',
    });
    expect(filesGrpcClient.getService).toHaveBeenCalledWith(FILES_SERVICE_NAME);
  });

  it('GET /users delegates to user-accounts over gRPC', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .get('/users')
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
      .get('/users')
      .expect(401);
    const body = response.body as { message: string };

    expect(body.message).toBe('Authentication failed');
  });

  it('POST /auth/login delegates credentials and stores the refresh token in a cookie', async () => {
    const response = await request(app.getHttpServer() as SupertestApp)
      .post('/auth/login')
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
      .post('/auth/registration')
      .send({
        username: 'user_123',
        email: 'user@example.com',
        password: 'Password1!',
      })
      .expect(204);

    expect(registrationServiceClient.registerUser).toHaveBeenCalledWith({
      username: 'user_123',
      email: 'user@example.com',
      password: 'Password1!',
    });
  });

  it('POST /auth/registration/confirmation delegates a confirmation code', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post('/auth/registration/confirmation')
      .send({ code: 'confirmation-code' })
      .expect(204);

    expect(registrationServiceClient.confirmRegistration).toHaveBeenCalledWith({
      code: 'confirmation-code',
    });
  });

  it('POST /auth/registration/resend-confirmation delegates an email', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post('/auth/registration/resend-confirmation')
      .send({ email: 'user@example.com' })
      .expect(204);

    expect(registrationServiceClient.resendRegistrationConfirmation).toHaveBeenCalledWith({
      email: 'user@example.com',
    });
  });

  it('POST /auth/refresh-token delegates the cookie to user-accounts', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post('/auth/refresh-token')
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
      .post('/auth/password-reset/request')
      .send({ email: 'user@example.com' })
      .expect(200)
      .expect({ message: 'If this email exists, password reset instructions were sent.' });

    expect(passwordResetServiceClient.requestPasswordReset).toHaveBeenCalledWith({
      email: 'user@example.com',
    });
  });

  it('POST /auth/password-reset/confirm delegates token and new password to user-accounts', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post('/auth/password-reset/confirm')
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
      .post('/auth/refresh-token')
      .expect(401);
  });

  it('rejects a refresh token with an invalid signature before calling user-accounts', async () => {
    jwtService.verifyAsync.mockRejectedValueOnce(new Error('invalid signature'));

    await request(app.getHttpServer() as SupertestApp)
      .post('/auth/refresh-token')
      .set('Cookie', 'refreshToken=invalid-refresh-token')
      .expect(401);

    expect(authServiceClient.refreshToken).not.toHaveBeenCalled();
  });

  it('GET /security/devices delegates the refresh token to user-accounts', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .get('/security/devices')
      .set('Cookie', 'refreshToken=current-refresh-token')
      .expect(200)
      .expect([
        {
          ip: '127.0.0.1',
          title: 'Browser',
          lastActiveDate: '2026-07-01T12:00:00.000Z',
          deviceId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        },
      ]);

    expect(sessionsServiceClient.getDevices).toHaveBeenCalledWith({
      auth: refreshTokenClaims,
    });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
});
