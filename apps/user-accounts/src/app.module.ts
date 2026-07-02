import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { authConfig } from './config/auth.config.js';
import { databaseConfig } from './config/database.config.js';
import { emailConfig } from './config/email.config.js';
import { UserAccountsGrpcConfig } from './config/user-accounts-grpc.config.js';
import { PrismaModule } from './database/prisma.module.js';
import { LoginUseCase } from './modules/auth/application/use-cases/login.use-case.js';
import { RefreshTokenUseCase } from './modules/auth/application/use-cases/refresh-token.use-case.js';
import { AuthService } from './modules/auth/auth.service.js';
import { AuthGrpcController } from './modules/auth/presentation/grpc/auth-grpc.controller.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { SessionsQueryRepository } from './modules/sessions/application/ports/sessions-query.repository.js';
import { SessionsRepository } from './modules/sessions/application/ports/sessions.repository.js';
import { SessionsService } from './modules/sessions/application/sessions.service.js';
import { GetSessionsUseCase } from './modules/sessions/application/use-cases/get-sessions.use-case.js';
import { PrismaSessionsQueryRepository } from './modules/sessions/infrastructure/persistence/prisma-sessions-query.repository.js';
import { PrismaSessionsRepository } from './modules/sessions/infrastructure/persistence/prisma-sessions.repository.js';
import { SessionsGrpcController } from './modules/sessions/presentation/grpc/sessions-grpc.controller.js';
import { UsersRepository } from './modules/users/application/ports/users.repository.js';
import { CreateUserUseCase } from './modules/users/application/use-cases/create-user.use-case.js';
import { GetUsersUseCase } from './modules/users/application/use-cases/get-users.use-case.js';
import { RegisterUserUseCase } from './modules/users/application/use-cases/register-user.use-case.js';
import { RegistrationConfirmationUseCase } from './modules/users/application/use-cases/registration-confirmation.use-case.js';
import { RegistrationEmailResendingUseCase } from './modules/users/application/use-cases/registration-email-resending.use-case.js';
import { UsersService } from './modules/users/application/users.service.js';
import { PrismaUsersRepository } from './modules/users/infrastructure/persistence/repositories/prisma-users.repository.js';
import { UsersGrpcController } from './modules/users/presentation/grpc/users-grpc.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `apps/user-accounts/.env.${process.env.NODE_ENV}.local`,
        `apps/user-accounts/.env.${process.env.NODE_ENV}`,
        `apps/user-accounts/.env.production`,
        'apps/user-accounts/.env',
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        `.env.production`,
        '.env',
      ],
      load: [authConfig, databaseConfig, emailConfig],
    }),
    CqrsModule,
    PrismaModule,
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        privateKey: config.jwtPrivateKey,
        signOptions: { algorithm: 'RS256' },
      }),
    }),
  ],
  controllers: [AuthGrpcController, SessionsGrpcController, UsersGrpcController],
  providers: [
    UserAccountsGrpcConfig,
    {
      provide: UsersRepository,
      useClass: PrismaUsersRepository,
    },
    {
      provide: SessionsRepository,
      useClass: PrismaSessionsRepository,
    },
    {
      provide: SessionsQueryRepository,
      useClass: PrismaSessionsQueryRepository,
    },
    AuthService,
    UsersService,
    SessionsService,
    LoginUseCase,
    RefreshTokenUseCase,
    GetSessionsUseCase,
    CreateUserUseCase,
    GetUsersUseCase,
    RegisterUserUseCase,
    RegistrationConfirmationUseCase,
    RegistrationEmailResendingUseCase,
  ],
})
export class UserAccountsModule {}
