import { configValidationUtility } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

class PostsGrpcClientConfig {
  @IsString({ message: 'Set env variable POSTS_GRPC_URL, example: localhost:50053' })
  @IsNotEmpty()
  declare readonly url: string;
}

export const postsGrpcClientConfig = registerAs('postsGrpcClient', () => {
  const config = plainToInstance(PostsGrpcClientConfig, {
    url: process.env.POSTS_GRPC_URL?.trim(),
  });

  configValidationUtility.validateConfig(config);

  return config;
});
