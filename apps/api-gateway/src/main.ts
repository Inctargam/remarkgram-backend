import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module.js';
import { ApiGatewayConfig } from './config/api-gateway.config.js';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);
  const config = app.get(ApiGatewayConfig);

  const port = config.port;
  await app.listen(port);
  console.log('GATEWAY started on port', port);
}
void bootstrap();
