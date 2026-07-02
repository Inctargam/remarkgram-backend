import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ApiGatewayModule } from './../src/api-gateway.module.js';
import { FilesGrpcClientAdapter } from '../src/modules/files/infrastructure/grpc/files-grpc-client.adapter.js';
import { UserAccountsGrpcClientAdapter } from '../src/modules/user-accounts/infrastructure/grpc/user-accounts-grpc-client.adapter.js';

type SupertestApp = Parameters<typeof request>[0];

describe('ApiGateway (e2e)', () => {
  let app: INestApplication;
  const uploadFile = vi.fn();
  const jwtService = { verifyAsync: vi.fn() };
  const refreshTokenClaims = {
    userId: '1',
    sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
    jti: 'current-jti',
  };
  const userAccountsClient = {
    getUsers: vi.fn(),
    login: vi.fn(),
    refreshToken: vi.fn(),
    getDevices: vi.fn(),
  };

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'testing');
    vi.stubEnv('GATEWAY_PORT', '0');
    vi.stubEnv('FILES_GRPC_URL', 'localhost:50051');
    vi.stubEnv('USER_ACCOUNTS_GRPC_URL', 'localhost:50052');
    vi.stubEnv('JWT_PUBLIC_KEY', 'public-key');
    vi.stubEnv('REFRESH_TOKEN_COOKIE_MAX_AGE_MS', '1200000');
    uploadFile.mockResolvedValue({ id: 'file-id' });
    jwtService.verifyAsync.mockResolvedValue({
      sub: refreshTokenClaims.userId,
      sessionId: refreshTokenClaims.sessionId,
      jti: refreshTokenClaims.jti,
    });
    userAccountsClient.getUsers.mockResolvedValue({
      users: [{ id: 1, username: 'user', email: 'user@example.com' }],
    });
    userAccountsClient.login.mockResolvedValue({
      accessToken: 'login-access-token',
      refreshToken: 'login-refresh-token',
    });
    userAccountsClient.refreshToken.mockResolvedValue({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
    });
    userAccountsClient.getDevices.mockResolvedValue({
      devices: [
        {
          ip: '127.0.0.1',
          title: 'Browser',
          lastActiveDate: '2026-07-01T12:00:00.000Z',
          deviceId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        },
      ],
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiGatewayModule],
    })
      .overrideProvider(FilesGrpcClientAdapter)
      .useValue({ uploadFile })
      .overrideProvider(UserAccountsGrpcClientAdapter)
      .useValue(userAccountsClient)
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

    expect(uploadFile).toHaveBeenCalledWith({ originalFilename: 'supper-name-files.png' });
  });

  it('GET /users delegates to user-accounts over gRPC', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .get('/users')
      .expect(200)
      .expect([{ id: 1, username: 'user', email: 'user@example.com' }]);

    expect(userAccountsClient.getUsers).toHaveBeenCalledOnce();
  });

  it('maps user-accounts gRPC errors to HTTP errors', async () => {
    userAccountsClient.getUsers.mockRejectedValueOnce({
      code: status.UNAUTHENTICATED,
      details: 'Authentication failed',
    });

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
      .send({ loginOrEmail: 'user', password: 'password' })
      .expect(200)
      .expect({ accessToken: 'login-access-token' });

    expect(response.headers['set-cookie']).toBeDefined();
    expect(userAccountsClient.login).toHaveBeenCalledWith(
      expect.objectContaining({
        loginOrEmail: 'user',
        password: 'password',
        deviceName: 'Browser',
      }),
    );
  });

  it('POST /auth/refresh-token delegates the cookie to user-accounts', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post('/auth/refresh-token')
      .set('Cookie', 'refreshToken=current-refresh-token')
      .set('User-Agent', 'Browser')
      .expect(200)
      .expect({ accessToken: 'rotated-access-token' });

    expect(userAccountsClient.refreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: refreshTokenClaims,
        deviceName: 'Browser',
      }),
    );
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

    expect(userAccountsClient.refreshToken).not.toHaveBeenCalled();
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

    expect(userAccountsClient.getDevices).toHaveBeenCalledWith({
      auth: refreshTokenClaims,
    });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
});
