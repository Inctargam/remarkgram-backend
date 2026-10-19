import { configValidationUtility, Environments } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

class PaymentsConfig {
  @IsString({ message: 'Set env variable PAYMENTS_GRPC_URL, example: localhost:50054' })
  @IsNotEmpty()
  declare readonly url: string;

  @IsInt({ message: 'Set env variable PAYMENTS_HTTP_PORT, example: 3004' })
  @Min(0)
  @Max(65535)
  @Type(() => Number)
  declare readonly httpPort: number;

  @IsEnum(Environments)
  declare readonly env: Environments;
}

export const paymentsConfig = registerAs('payments', () => {
  const config = plainToInstance(PaymentsConfig, {
    url: process.env.PAYMENTS_GRPC_URL?.trim(),
    httpPort: process.env.PAYMENTS_HTTP_PORT,
    env: process.env.NODE_ENV ?? Environments.DEVELOPMENT,
  });

  configValidationUtility.validateConfig(config);
  return config;
});
