import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiGatewayConfig } from './api-gateway.config.js';

@Module({
  imports: [ConfigModule],
  providers: [ApiGatewayConfig],
  exports: [ApiGatewayConfig],
})
export class ApiGatewayConfigModule {}
