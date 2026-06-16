import { Module } from '@nestjs/common';
import { ApiGatewayConfig } from './api-gateway.config.js';

@Module({
  providers: [ApiGatewayConfig],
  exports: [ApiGatewayConfig],
})
export class ApiGatewayConfigModule {}
