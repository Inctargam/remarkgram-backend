import { registerAs } from '@nestjs/config';
import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { configValidationUtility, Environments } from '@app/config';

class ApiGatewayConfig {
  @IsInt({ message: 'Set env variable GATEWAY_PORT, example: 3000' })
  @Min(0)
  @Max(65535)
  @Type(() => Number)
  declare readonly port: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsUrl({ require_protocol: true, require_tld: false }, { each: true })
  declare readonly corsAllowedOrigins: string[];

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
  const corsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim());

  const config = plainToInstance(ApiGatewayConfig, {
    port: process.env.GATEWAY_PORT,
    corsAllowedOrigins,
    env: process.env.NODE_ENV ?? Environments.DEVELOPMENT,
    testingEndpointsEnabled: process.env.ENABLE_TESTING_ENDPOINTS === 'true',
    testingEndpointKey: process.env.TESTING_ENDPOINT_KEY,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
