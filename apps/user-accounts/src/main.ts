import { NestFactory } from '@nestjs/core';
import { UserAccountsModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(UserAccountsModule);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
