import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../database/prisma/prisma.module.js';
import { UsersRepository } from './application/ports/users.repository.js';
import { GetUsersUseCase } from './application/use-cases/get-users.use-case.js';
import { PrismaUsersRepository } from './infrastructure/prisma/repositories/prisma-users.repository.js';
import { UsersController } from './presentation/http/controllers/users.controller.js';

@Module({
  imports: [CqrsModule, PrismaModule],
  controllers: [UsersController],
  providers: [
    {
      provide: UsersRepository,
      useClass: PrismaUsersRepository,
    },
    GetUsersUseCase,
  ],
})
export class UsersModule {}
