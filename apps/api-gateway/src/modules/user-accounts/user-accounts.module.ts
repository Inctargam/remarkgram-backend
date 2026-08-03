import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  USER_ACCOUNTS_GRPC_PROTO_PATH,
} from '@app/user-accounts-grpc';
import { userAccountsGrpcClientConfig } from './config/user-accounts-grpc-client.config.js';
import { AuthHttpController } from './presentation/http/controllers/auth-http.controller.js';
import { SessionsHttpController } from './presentation/http/controllers/sessions-http.controller.js';
import { TestingHttpController } from './presentation/http/controllers/testing-http.controller.js';
import { UsersHttpController } from './presentation/http/controllers/users-http.controller.js';
import { OptionalRefreshTokenGuard } from './presentation/http/guards/optional-refresh-token.guard.js';
import { RefreshTokenGuard } from './presentation/http/guards/refresh-token.guard.js';
import { RecaptchaVerifiersService } from './presentation/captcha/recaptcha-verifiers.service.js';
import { PassportModule } from '@nestjs/passport';
import { GithubStrategy } from './presentation/http/guards/github/github.strategy.js';
import { googleOidcConfigurationProvider } from './config/google-oidc-configuration.provider.js';

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
            protoPath: USER_ACCOUNTS_GRPC_PROTO_PATH,
            url: config.url,
          },
        }),
      },
    ]),
    PassportModule.register({ defaultStrategy: 'github' }),
  ],
  controllers: [AuthHttpController, SessionsHttpController, TestingHttpController, UsersHttpController],
  providers: [
    OptionalRefreshTokenGuard,
    RefreshTokenGuard,
    RecaptchaVerifiersService,
    GithubStrategy,
    googleOidcConfigurationProvider,
  ],
})
export class UserAccountsModule {}
