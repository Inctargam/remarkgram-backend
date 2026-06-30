import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserAccountsModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { UsersRepository } from './../src/modules/users/application/ports/users.repository.js';
import { User } from './../src/modules/users/domain/entities/user.entity.js';

type SupertestApp = Parameters<typeof request>[0];

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  const usersRepository = {
    findMany: vi.fn(),
  };

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/user_accounts');
    vi.stubEnv('JWT_PRIVATE_KEY', 'private-key');
    vi.stubEnv('ACCESS_TOKEN_EXPIRES_IN', '10m');
    vi.stubEnv('REFRESH_TOKEN_EXPIRES_IN', '20m');
    vi.stubEnv('REFRESH_TOKEN_COOKIE_MAX_AGE_MS', '1200000');
    vi.stubEnv('CONFIRMATION_CODE_EXPIRES_IN', '24');
    vi.stubEnv('RECOVERY_CODE_EXPIRES_IN', '1');

    usersRepository.findMany.mockReset();
    usersRepository.findMany.mockResolvedValue([
      User.restore({
        id: 1,
        username: 'user',
        email: 'user@example.com',
      }),
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UserAccountsModule],
    })
      .overrideProvider(UsersRepository)
      .useValue(usersRepository)
      .overrideProvider(PrismaService)
      .useValue({
        $disconnect: vi.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/users (GET)', () => {
    return request(app.getHttpServer() as SupertestApp)
      .get('/users')
      .expect(200)
      .expect([
        {
          id: 1,
          username: 'user',
          email: 'user@example.com',
        },
      ]);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });
});
