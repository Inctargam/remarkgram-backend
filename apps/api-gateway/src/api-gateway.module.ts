import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from './common/http/guards/access-token.guard.js';
import { GrpcToHttpExceptionFilter } from './common/http/filters/grpc-to-http-exception.filter.js';
import { apiGatewayConfig } from './config/api-gateway.config.js';
import { filesGrpcClientConfig } from './modules/files/config/files-grpc-client.config.js';
import { FilesModule } from './modules/files/files.module.js';
import { userAccountsGrpcClientConfig } from './modules/user-accounts/config/user-accounts-grpc-client.config.js';
import { userAccountsHttpConfig } from './modules/user-accounts/config/user-accounts-http.config.js';
import { UserAccountsModule } from './modules/user-accounts/user-accounts.module.js';
import { recaptchaSecretConfig } from './modules/user-accounts/config/recaptcha-secret.config.js';
import { githubOauthConfig } from './modules/user-accounts/config/github-oauth.config.js';
import { frontendConfig } from './config/frontend.config.js';
import { googleOidcConfig } from './modules/user-accounts/config/google-oidc.config.js';
import { postsGrpcClientConfig } from './modules/posts/config/posts-grpc-client.config.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { TestingModule } from './modules/testing/testing.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `apps/api-gateway/.env.${process.env.NODE_ENV}.local`,
        `apps/api-gateway/.env.${process.env.NODE_ENV}`,
        `apps/api-gateway/.env.production`,
        'apps/api-gateway/.env',
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        `.env.production`,
        '.env',
      ],
      load: [
        apiGatewayConfig,
        filesGrpcClientConfig,
        postsGrpcClientConfig,
        userAccountsGrpcClientConfig,
        userAccountsHttpConfig,
        recaptchaSecretConfig,
        githubOauthConfig,
        googleOidcConfig,
        frontendConfig,
      ],
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [userAccountsHttpConfig.KEY],
      useFactory: (config: ConfigType<typeof userAccountsHttpConfig>) => ({
        publicKey: config.jwtPublicKey,
        verifyOptions: { algorithms: ['RS256'] },
      }),
    }),
    FilesModule,
    PostsModule,
    TestingModule,
    UserAccountsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GrpcToHttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
  ],
})
export class ApiGatewayModule {}
