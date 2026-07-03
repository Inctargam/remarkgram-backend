import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsString } from 'class-validator';
import { configValidationUtility } from '@app/config';

class UserAccountsGrpcConfig {
  @IsString({
    message: 'Set env variable USER_ACCOUNTS_GRPC_URL, example: localhost:50052',
  })
  declare readonly url: string;
}

export const userAccountsGrpcConfig = registerAs('userAccountsGrpc', () => {
  const config = plainToInstance(UserAccountsGrpcConfig, {
    url: process.env.USER_ACCOUNTS_GRPC_URL,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
