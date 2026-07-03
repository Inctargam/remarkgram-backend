import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { GrpcToHttpExceptionFilter } from './common/http/filters/grpc-to-http-exception.filter.js';
import { apiGatewayConfig } from './config/api-gateway.config.js';
import { filesGrpcClientConfig } from './modules/files/config/files-grpc-client.config.js';
import { FilesModule } from './modules/files/files.module.js';
import { userAccountsGrpcClientConfig } from './modules/user-accounts/config/user-accounts-grpc-client.config.js';
import { userAccountsHttpConfig } from './modules/user-accounts/config/user-accounts-http.config.js';
import { UserAccountsModule } from './modules/user-accounts/user-accounts.module.js';

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
      load: [apiGatewayConfig, filesGrpcClientConfig, userAccountsGrpcClientConfig, userAccountsHttpConfig],
    }),
    FilesModule,
    UserAccountsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GrpcToHttpExceptionFilter,
    },
  ],
})
export class ApiGatewayModule {}
