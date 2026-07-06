import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { authConfig } from './config/auth.config.js';
import { databaseConfig } from './config/database.config.js';
import { emailConfig } from './config/email.config.js';
import { passwordResetConfig } from './config/password-reset.config.js';
import { userAccountsGrpcConfig } from './config/user-accounts-grpc.config.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthService } from './features/auth/application/auth.service.js';
import { LoginUseCase } from './features/auth/application/use-cases/login.use-case.js';
import { RefreshTokenUseCase } from './features/auth/application/use-cases/refresh-token.use-case.js';
import { AuthGrpcController } from './features/auth/presentation/grpc/controllers/auth-grpc.controller.js';
import { NotificationsModule } from './features/notifications/notifications.module.js';
import { PasswordHasher } from './features/password-reset/application/ports/password-hasher.js';
import { PasswordResetTokenService } from './features/password-reset/application/ports/password-reset-token.service.js';
import { PasswordResetTokensRepository } from './features/password-reset/application/ports/password-reset-tokens.repository.js';
import { PasswordResetUsersRepository } from './features/password-reset/application/ports/password-reset-users.repository.js';
import { ConfirmPasswordResetUseCase } from './features/password-reset/application/use-cases/confirm-password-reset.use-case.js';
import { RequestPasswordResetUseCase } from './features/password-reset/application/use-cases/request-password-reset.use-case.js';
import { HmacPasswordResetTokenService } from './features/password-reset/infrastructure/crypto/hmac-password-reset-token.service.js';
import { PrismaPasswordResetUsersRepository } from './features/password-reset/infrastructure/persistence/prisma-password-reset-users.repository.js';
import { PrismaPasswordRestTokensRepository } from './features/password-reset/infrastructure/persistence/prisma-password-rest-tokens.repository.js';
import { PasswordResetGrpcController } from './features/password-reset/presentation/grpc/controllers/password-reset-grpc.controller.js';
import { SessionsQueryRepository } from './features/sessions/application/ports/sessions-query.repository.js';
import { SessionsRepository } from './features/sessions/application/ports/sessions.repository.js';
import { SessionsService } from './features/sessions/application/sessions.service.js';
import { GetSessionsUseCase } from './features/sessions/application/use-cases/get-sessions.use-case.js';
import { PrismaSessionsQueryRepository } from './features/sessions/infrastructure/persistence/prisma-sessions-query.repository.js';
import { PrismaSessionsRepository } from './features/sessions/infrastructure/persistence/prisma-sessions.repository.js';
import { SessionsGrpcController } from './features/sessions/presentation/grpc/controllers/sessions-grpc.controller.js';
import { UsersRepository } from './features/users/application/ports/users.repository.js';
import { CreateUserUseCase } from './features/users/application/use-cases/create-user.use-case.js';
import { GetUsersUseCase } from './features/users/application/use-cases/get-users.use-case.js';
import { RegisterUserUseCase } from './features/users/application/use-cases/register-user.use-case.js';
import { RegistrationConfirmationUseCase } from './features/users/application/use-cases/registration-confirmation.use-case.js';
import { RegistrationEmailResendingUseCase } from './features/users/application/use-cases/registration-email-resending.use-case.js';
import { UsersService } from './features/users/application/users.service.js';
import { PrismaUsersRepository } from './features/users/infrastructure/persistence/repositories/prisma-users.repository.js';
import { UsersGrpcController } from './features/users/presentation/grpc/controllers/users-grpc.controller.js';

const PASSWORD_RESET_PROVIDERS = [
  {
    provide: PasswordResetTokensRepository,
    useClass: PrismaPasswordRestTokensRepository,
  },
  {
    provide: PasswordResetUsersRepository,
    useClass: PrismaPasswordResetUsersRepository,
  },
  {
    provide: PasswordHasher,
    useExisting: AuthService,
  },
  {
    provide: PasswordResetTokenService,
    useClass: HmacPasswordResetTokenService,
  },
  RequestPasswordResetUseCase,
  ConfirmPasswordResetUseCase,
];

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
      load: [authConfig, databaseConfig, emailConfig, passwordResetConfig, userAccountsGrpcConfig],
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
  controllers: [AuthGrpcController, SessionsGrpcController, UsersGrpcController, PasswordResetGrpcController],
  providers: [
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
    ...PASSWORD_RESET_PROVIDERS,
  ],
})
export class UserAccountsModule {}
