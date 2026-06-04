import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { PostsController } from './presentation/http/controllers/posts.controller.js';

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
  controllers: [PostsController],
})
export class AppModule {}
