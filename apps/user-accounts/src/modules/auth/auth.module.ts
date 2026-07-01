import { forwardRef, Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { authConfig } from '../../config/auth.config.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthService } from './auth.service.js';
import { LoginUseCase } from './application/use-cases/login.use-case.js';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case.js';
import { ValidateRefreshTokenUseCase } from './application/use-cases/validate-refresh-token.use-case.js';
import { RefreshTokenValidator } from './application/refresh-token-validator.js';
import { AuthGrpcController } from './presentation/grpc/auth-grpc.controller.js';

@Module({
  imports: [
    CqrsModule,
    SessionsModule,
    forwardRef(() => UsersModule),
    JwtModule.registerAsync({
      global: true,
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.jwtPrivateKey,
      }),
    }),
  ],
  controllers: [AuthGrpcController],
  providers: [
    AuthService,
    LoginUseCase,
    RefreshTokenUseCase,
    ValidateRefreshTokenUseCase,
    RefreshTokenValidator,
  ],
  exports: [AuthService],
})
export class AuthModule {}
