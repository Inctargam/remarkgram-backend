import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { UserAccountsHttpConfigModule } from './config/user-accounts-http-config.module.js';
import { UserAccountsHttpConfig } from './config/user-accounts-http.config.js';
import { UserAccountsGrpcClientModule } from './infrastructure/grpc/user-accounts-grpc-client.module.js';
import { AuthHttpController } from './presentation/http/controllers/auth-http.controller.js';
import { DevicesHttpController } from './presentation/http/controllers/devices-http.controller.js';
import { UsersHttpController } from './presentation/http/controllers/users-http.controller.js';
import { AccessTokenGuard } from './presentation/http/guards/access-token.guard.js';
import { OptionalRefreshTokenGuard } from './presentation/http/guards/optional-refresh-token.guard.js';
import { RefreshTokenGuard } from './presentation/http/guards/refresh-token.guard.js';

@Module({
  imports: [
    UserAccountsGrpcClientModule,
    UserAccountsHttpConfigModule,
    JwtModule.registerAsync({
      imports: [UserAccountsHttpConfigModule],
      inject: [UserAccountsHttpConfig],
      useFactory: (config: UserAccountsHttpConfig) => ({
        publicKey: config.jwtPublicKey,
        verifyOptions: { algorithms: ['RS256'] },
      }),
    }),
  ],
  controllers: [AuthHttpController, DevicesHttpController, UsersHttpController],
  providers: [
    OptionalRefreshTokenGuard,
    RefreshTokenGuard,
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
  ],
})
export class UserAccountsModule {}
