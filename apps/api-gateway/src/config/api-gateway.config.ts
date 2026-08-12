import { registerAs } from '@nestjs/config';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { configValidationUtility, Environments } from '@app/config';
import { API_PREFIX } from '../http-api.constants.js';

const DEFAULT_BACKEND_API_URL = `https://remark-gram.com/${API_PREFIX}/`;
const escapedApiPrefix = API_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BACKEND_API_URL_PATTERN = new RegExp(`/${escapedApiPrefix}/?$`);

class ApiGatewayConfig {
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    require_tld: false,
  })
  @Matches(BACKEND_API_URL_PATTERN, {
    message: `BACKEND_API_URL must end with /${API_PREFIX} or /${API_PREFIX}/`,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && !value.endsWith('/') ? `${value}/` : value,
  )
  declare readonly backendApiUrl: string;

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

  @IsEnum(Environments)
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
    backendApiUrl: process.env.BACKEND_API_URL?.trim() || DEFAULT_BACKEND_API_URL,
    port: process.env.GATEWAY_PORT,
    corsAllowedOrigins,
    env: process.env.NODE_ENV ?? Environments.DEVELOPMENT,
    testingEndpointsEnabled: process.env.ENABLE_TESTING_ENDPOINTS === 'true',
    testingEndpointKey: process.env.TESTING_ENDPOINT_KEY,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
