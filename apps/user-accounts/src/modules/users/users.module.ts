import { forwardRef, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../database/prisma.module.js';
import { UsersRepository } from './application/ports/users.repository.js';
import { GetUsersUseCase } from './application/use-cases/get-users.use-case.js';
import { PrismaUsersRepository } from './infrastructure/persistence/repositories/prisma-users.repository.js';
import { UsersGrpcController } from './presentation/grpc/users-grpc.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersService } from './application/users.service.js';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case.js';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case.js';
import { RegistrationConfirmationUseCase } from './application/use-cases/registration-confirmation.use-case.js';
import { RegistrationEmailResendingUseCase } from './application/use-cases/registration-email-resending.use-case.js';

@Module({
  imports: [CqrsModule, PrismaModule, forwardRef(() => AuthModule), NotificationsModule],
  controllers: [UsersGrpcController],
  providers: [
    {
      provide: UsersRepository,
      useClass: PrismaUsersRepository,
    },
    UsersService,
    GetUsersUseCase,
    CreateUserUseCase,
    RegisterUserUseCase,
    RegistrationConfirmationUseCase,
    RegistrationEmailResendingUseCase,
  ],
  exports: [UsersRepository],
})
export class UsersModule {}
