import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FilesModule } from './modules/files/files.module.js';
import { ApiGatewayConfigModule } from './config/api-gateway-config.module.js';

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
      load: [],
    }),
    ApiGatewayConfigModule,
    FilesModule,
  ],
})
export class ApiGatewayModule {}
