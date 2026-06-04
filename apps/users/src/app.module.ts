import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersRepository } from './application/ports/users.repository.js';
import { GetUsersUseCase } from './application/use-cases/get-users.use-case.js';
import { PrismaService } from './infrastructure/prisma/prisma.service.js';
import { PrismaUsersRepository } from './infrastructure/prisma/repositories/prisma-users.repository.js';
import { UsersController } from './presentation/http/controllers/users.controller.js';

@Module({
  imports: [
    CqrsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `apps/users/.env.${process.env.NODE_ENV}.local`,
        `apps/users/.env.${process.env.NODE_ENV}`,
        `apps/users/.env.production`,
        'apps/users/.env',
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        `.env.production`,
        '.env',
      ],
      load: [],
    }),
  ],
  controllers: [UsersController],
  providers: [
    PrismaService,
    {
      provide: UsersRepository,
      useClass: PrismaUsersRepository,
    },
    GetUsersUseCase,
  ],
})
export class AppModule {}
