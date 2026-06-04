import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { UsersRepository } from './../src/application/ports/users.repository.js';
import { User } from './../src/domain/entities/user.entity.js';
import { PrismaService } from './../src/infrastructure/prisma/prisma.service.js';

type SupertestApp = Parameters<typeof request>[0];

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  const usersRepository = {
    findMany: vi.fn(),
  };

  beforeEach(async () => {
    usersRepository.findMany.mockReset();
    usersRepository.findMany.mockResolvedValue([
      User.restore({
        id: 1,
        email: 'user@example.com',
        name: 'User',
      }),
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
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
          email: 'user@example.com',
          name: 'User',
        },
      ]);
  });

  afterEach(async () => {
    await app.close();
  });
});
