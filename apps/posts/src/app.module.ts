import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { PostsController } from './presentation/http/controllers/posts.controller.js';
import { PrismaService } from './infrastructure/prisma/prisma.service.js';
import { PrismaPostsRepository } from './infrastructure/prisma/repositories/prisma-posts.repository.js';
import { PostsRepository } from './application/ports/posts.repository.js';
import { KillDragonHandler } from './application/use-cases/create-post/create-post.use-case.js';
import { GetPostsQueryHandler } from './application/use-cases/get-posts/get-posts.use-case.js';

@Module({
  imports: [
    CqrsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `apps/posts/.env.${process.env.NODE_ENV}.local`,
        `apps/posts/.env.${process.env.NODE_ENV}`,
        `apps/posts/.env.production`,
        'apps/posts/.env',
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        `.env.production`,
        '.env',
      ],
      load: [],
    }),
  ],
  providers: [
    PrismaService,
    PrismaPostsRepository,
    KillDragonHandler,
    GetPostsQueryHandler,
    {
      provide: PostsRepository,
      useClass: PrismaPostsRepository,
    },
  ],
  controllers: [PostsController],
})
export class AppModule {}
