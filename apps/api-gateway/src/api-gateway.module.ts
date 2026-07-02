import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { GrpcToHttpExceptionFilter } from './common/presentation/http/filters/grpc-to-http-exception.filter.js';
import { ApiGatewayConfig } from './config/api-gateway.config.js';
import { FilesModule } from './modules/files/files.module.js';
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
    }),
    FilesModule,
    UserAccountsModule,
  ],
  providers: [
    ApiGatewayConfig,
    {
      provide: APP_FILTER,
      useClass: GrpcToHttpExceptionFilter,
    },
  ],
})
export class ApiGatewayModule {}
