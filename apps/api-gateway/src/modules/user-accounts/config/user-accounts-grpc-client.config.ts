import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsString } from 'class-validator';
import { configValidationUtility } from '@app/config';

class UserAccountsGrpcClientConfig {
  @IsString({
    message: 'Set env variable USER_ACCOUNTS_GRPC_URL, example: localhost:50052',
  })
  declare readonly url: string;
}

export const userAccountsGrpcClientConfig = registerAs('userAccountsGrpcClient', () => {
  const config = plainToInstance(UserAccountsGrpcClientConfig, {
    url: process.env.USER_ACCOUNTS_GRPC_URL,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
