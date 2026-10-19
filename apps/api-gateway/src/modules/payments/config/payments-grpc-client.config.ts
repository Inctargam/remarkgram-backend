import { configValidationUtility } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

class PaymentsGrpcClientConfig {
  @IsString({ message: 'Set env variable PAYMENTS_GRPC_URL, example: localhost:50054' })
  @IsNotEmpty()
  declare readonly url: string;
}
export const paymentsGrpcClientConfig = registerAs('paymentsGrpcClient', () => {
  const config = plainToInstance(PaymentsGrpcClientConfig, { url: process.env.PAYMENTS_GRPC_URL?.trim() });
  configValidationUtility.validateConfig(config);
  return config;
});
