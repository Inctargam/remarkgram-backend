import { Environments, configValidationUtility } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

class PostsConfig {
  @IsString({ message: 'Set env variable POSTS_GRPC_URL, example: localhost:50053' })
  @IsNotEmpty()
  declare readonly url: string;

  @IsEnum(Environments)
  declare readonly env: Environments;
}

export const postsConfig = registerAs('posts', () => {
  const config = plainToInstance(PostsConfig, {
    url: process.env.POSTS_GRPC_URL?.trim(),
    env: process.env.NODE_ENV ?? Environments.DEVELOPMENT,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
