import { configValidationUtility } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

class FilesGrpcClientConfig {
  @IsString({ message: 'Set env variable FILES_GRPC_URL, example: localhost:50051' })
  @IsNotEmpty()
  declare readonly url: string;
}

export const filesGrpcClientConfig = registerAs('postsFilesGrpcClient', () => {
  const config = plainToInstance(FilesGrpcClientConfig, {
    url: process.env.FILES_GRPC_URL?.trim(),
  });

  configValidationUtility.validateConfig(config);

  return config;
});
