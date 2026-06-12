import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { PostsConfig } from './config/posts.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(PostsConfig);

  await app.listen(config.port);
  console.log(`Posts listening on port ${config.port}`);
}
void bootstrap();
