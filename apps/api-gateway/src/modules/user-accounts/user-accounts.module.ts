import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME } from '@app/user-accounts-grpc';
import { join } from 'node:path';
import { userAccountsGrpcClientConfig } from './config/user-accounts-grpc-client.config.js';
import { userAccountsHttpConfig } from './config/user-accounts-http.config.js';
import { AuthHttpController } from './presentation/http/controllers/auth-http.controller.js';
import { SessionsHttpController } from './presentation/http/controllers/sessions-http.controller.js';
import { UsersHttpController } from './presentation/http/controllers/users-http.controller.js';
import { AccessTokenGuard } from './presentation/http/guards/access-token.guard.js';
import { OptionalRefreshTokenGuard } from './presentation/http/guards/optional-refresh-token.guard.js';
import { RefreshTokenGuard } from './presentation/http/guards/refresh-token.guard.js';

const protoPath = join(
  import.meta.dirname,
  '../../../../../libs/contracts/user-accounts-grpc/src/proto/user-accounts.proto',
);

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
        inject: [userAccountsGrpcClientConfig.KEY],
        useFactory: (config: ConfigType<typeof userAccountsGrpcClientConfig>) => ({
          transport: Transport.GRPC,
          options: {
            package: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
            protoPath,
            url: config.url,
          },
        }),
      },
    ]),
    JwtModule.registerAsync({
      inject: [userAccountsHttpConfig.KEY],
      useFactory: (config: ConfigType<typeof userAccountsHttpConfig>) => ({
        publicKey: config.jwtPublicKey,
        verifyOptions: { algorithms: ['RS256'] },
      }),
    }),
  ],
  controllers: [AuthHttpController, SessionsHttpController, UsersHttpController],
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
