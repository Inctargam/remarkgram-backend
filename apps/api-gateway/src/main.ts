import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);
  await app.listen(process.env.PORT ?? 3000);
  console.log('GATEWAY started on port', process.env.PORT ?? 3000);
}
void bootstrap();
