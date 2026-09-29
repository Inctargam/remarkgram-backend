import { afterAll, beforeAll, beforeEach, describe, expect } from 'vitest';
import { type INestApplicationContext } from '@nestjs/common';
import {
  GetAuthorPostsQuery,
  GetAuthorPostsQueryHandler,
} from '../../src/application/use-cases/get-author-posts/get-author-posts.query-handler.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import type { PostViewMapper } from '../../src/infrastructure/prisma/mappers/post-view.mapper.js';

const NOW_DATE = '2026-08-11T11:00:00.000Z';
describe.skip('GetAuthorPostsQueryHandler integration with the database', () => {
  let app: INestApplicationContext;
  let queryHandler: GetAuthorPostsQueryHandler;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Включаем контроль над таймерами и датой
    vi.useFakeTimers();
    // Замораживаем время на конкретной дате (1 января 2026 года)
    vi.setSystemTime(new Date(NOW_DATE));

    app = moduleRef.createNestApplication();
    await app.init();

    queryHandler = app.get(GetAuthorPostsQueryHandler);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.post.deleteMany();
  });
  afterAll(async () => {
    await app?.close();
    // Возвращаем реальное системное время обратно
    vi.useRealTimers();
  });

  it('return the next page using a cursor', async () => {
    const authorId = 42;
    const limit = 2;

    await prisma.post.createMany({
      data: [
        {
          id: 1,
          authorId,
          createdAt: new Date('2026-08-11T11:00:00.000Z'),
        },
        {
          id: 2,
          authorId,
          createdAt: new Date('2026-08-11T11:10:00.000Z'),
        },
        {
          id: 3,
          authorId,
          createdAt: new Date('2026-08-11T12:23:00.000Z'),
        },
      ],
    });

    const firstPage = await queryHandler.execute(
      new GetAuthorPostsQuery({
        authorId,
        limit: limit,
        cursor: undefined,
      }),
    );

    const nextCursor = {
      id: 1,
      createdAt: new Date('2026-08-11T11:00:00.000Z'),
    };
    const nextPageToBase64 = Buffer.from(JSON.stringify(nextCursor)).toString('base64');

    expect(firstPage.nextCursor).toContain(nextPageToBase64);
    expect(firstPage.items.length).toBe(limit);
    expect(firstPage.items.map((p: PostViewMapper) => p.id)).toEqual([3, 2]);
    expect(firstPage.hasMore).toBeTruthy();

    const secondPage = await queryHandler.execute(
      new GetAuthorPostsQuery({
        authorId,
        limit: limit,
        cursor: firstPage.nextCursor,
      }),
    );

    expect(secondPage.nextCursor).toBeNull();
    expect(secondPage.items.map((post: PostViewMapper) => post.id)).toEqual([1]);
  });

  it('return empty list when user no has posts', async () => {
    const authorId = 42;
    const limit = 2;

    const authorNotHasListPost = await queryHandler.execute(
      new GetAuthorPostsQuery({
        authorId,
        limit: limit,
        cursor: undefined,
      }),
    );
    expect(authorNotHasListPost.items.length).toBe(0);
    expect(authorNotHasListPost.hasMore).toBeFalsy();
    expect(authorNotHasListPost.nextCursor).toBeNull();
  });
});
