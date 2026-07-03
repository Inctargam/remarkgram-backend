import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsString } from 'class-validator';
import { configValidationUtility } from '@app/config';

class FilesGrpcClientConfig {
  @IsString({ message: 'Set env variable FILES_GRPC_URL, example:localhost:50051 ' })
  declare readonly url: string;
}

export const filesGrpcClientConfig = registerAs('filesGrpcClient', () => {
  const config = plainToInstance(FilesGrpcClientConfig, {
    url: process.env.FILES_GRPC_URL,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
