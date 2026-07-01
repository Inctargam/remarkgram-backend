import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ApiGatewayModule } from './../src/api-gateway.module.js';
import { FilesGrpcClientAdapter } from '../src/modules/files/infrastructure/grpc/files-grpc-client.adapter.js';
import { UserAccountsGrpcClientAdapter } from '../src/modules/user-accounts/infrastructure/grpc/user-accounts-grpc-client.adapter.js';

type SupertestApp = Parameters<typeof request>[0];

describe('ApiGateway (e2e)', () => {
  let app: INestApplication;
  const uploadFile = vi.fn();
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
    vi.stubEnv('JWT_PRIVATE_KEY', 'private-key');
    vi.stubEnv('REFRESH_TOKEN_COOKIE_MAX_AGE_MS', '1200000');
    uploadFile.mockResolvedValue({ id: 'file-id' });
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
        refreshToken: 'current-refresh-token',
        deviceName: 'Browser',
      }),
    );
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
      refreshToken: 'current-refresh-token',
    });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
});
