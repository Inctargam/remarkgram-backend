import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsUrl } from 'class-validator';
import { configValidationUtility } from '@app/config';

const DEFAULT_FRONTEND_URL = 'https://remark-gram.com';

class FrontendConfig {
  @IsUrl({ require_protocol: true, require_tld: false })
  declare readonly baseUrl: string;
}

export const frontendConfig = registerAs('frontend', () => {
  const config = plainToInstance(FrontendConfig, {
    baseUrl: process.env.FRONTEND_URL?.trim() || DEFAULT_FRONTEND_URL,
  });

  configValidationUtility.validateConfig(config);
  return config;
});
