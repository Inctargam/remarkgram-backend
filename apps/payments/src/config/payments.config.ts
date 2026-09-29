import { configValidationUtility, Environments } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

class PaymentsConfig {
  @IsString({ message: 'Set env variable PAYMENTS_GRPC_URL, example: localhost:50054' })
  @IsNotEmpty()
  declare readonly url: string;

  @IsEnum(Environments)
  declare readonly env: Environments;
}

export const paymentsConfig = registerAs('payments', () => {
  const config = plainToInstance(PaymentsConfig, {
    url: process.env.PAYMENTS_GRPC_URL?.trim(),
    env: process.env.NODE_ENV ?? Environments.DEVELOPMENT,
  });

  configValidationUtility.validateConfig(config);
  return config;
});
