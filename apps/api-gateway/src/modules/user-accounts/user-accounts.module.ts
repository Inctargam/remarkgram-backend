import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UserAccountsHttpConfigModule } from './config/user-accounts-http-config.module.js';
import { UserAccountsHttpConfig } from './config/user-accounts-http.config.js';
import { UserAccountsGrpcClientModule } from './infrastructure/grpc/user-accounts-grpc-client.module.js';
import { AuthHttpController } from './presentation/http/controllers/auth-http.controller.js';
import { DevicesHttpController } from './presentation/http/controllers/devices-http.controller.js';
import { UsersHttpController } from './presentation/http/controllers/users-http.controller.js';
import { AccessTokenGuard } from './presentation/http/guards/access-token.guard.js';

@Module({
  imports: [
    UserAccountsGrpcClientModule,
    UserAccountsHttpConfigModule,
    JwtModule.registerAsync({
      imports: [UserAccountsHttpConfigModule],
      inject: [UserAccountsHttpConfig],
      useFactory: (config: UserAccountsHttpConfig) => ({
        secret: config.jwtPrivateKey,
      }),
    }),
  ],
  controllers: [AuthHttpController, DevicesHttpController, UsersHttpController],
  providers: [AccessTokenGuard],
  exports: [AccessTokenGuard],
})
export class UserAccountsModule {}
