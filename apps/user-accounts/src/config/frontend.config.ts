import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsUrl } from 'class-validator';
import { configValidationUtility } from '@app/config';

const DEFAULT_FRONTEND_URL = 'https://remarkgram.com';

class FrontendConfig {
  @IsUrl({ require_protocol: true, require_tld: false })
  declare readonly baseUrl: string;
}

export const frontendConfig = registerAs('frontend', () => {
  const rawUrl = process.env.FRONTEND_URL?.trim() || DEFAULT_FRONTEND_URL;
  const baseUrl = /^[a-z][a-z\d+\-.]*:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`;
  const config = plainToInstance(FrontendConfig, { baseUrl });

  configValidationUtility.validateConfig(config);

  return config;
});
