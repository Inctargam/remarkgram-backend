import { registerAs } from '@nestjs/config';
import { plainToInstance, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsString, Max, Min, MinLength, ValidateIf } from 'class-validator';
import { configValidationUtility, Environments } from '@app/config';

class ApiGatewayConfig {
  @IsInt({ message: 'Set env variable GATEWAY_PORT, example: 3000' })
  @Min(0)
  @Max(65535)
  @Type(() => Number)
  declare readonly port: number;

  @IsEnum(Environments, {
    message:
      'Set correct NODE_ENV value, available values: ' +
      configValidationUtility.getEnumValues(Environments).join(', '),
  })
  declare readonly env: Environments;

  @IsBoolean()
  declare readonly testingEndpointsEnabled: boolean;

  @ValidateIf((config: ApiGatewayConfig) => config.testingEndpointsEnabled)
  @IsString()
  @MinLength(32)
  declare readonly testingEndpointKey: string | undefined;
}

export const apiGatewayConfig = registerAs('apiGateway', () => {
  const config = plainToInstance(ApiGatewayConfig, {
    port: process.env.GATEWAY_PORT,
    env: process.env.NODE_ENV ?? Environments.DEVELOPMENT,
    testingEndpointsEnabled: process.env.ENABLE_TESTING_ENDPOINTS === 'true',
    testingEndpointKey: process.env.TESTING_ENDPOINT_KEY,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
