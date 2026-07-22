import { registerAs } from '@nestjs/config';
import { configValidationUtility } from '@app/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';
import { Trim } from '../../../common/http/decorators/trim.decorator.ts';

export const GOOGLE_OIDC_ISSUER = 'https://accounts.google.com';

class GoogleOidcConfig {
  @Trim()
  @IsString()
  @IsNotEmpty()
  declare readonly clientId: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  declare readonly clientSecret: string;

  @Trim()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    require_tld: false,
  })
  declare readonly callbackUrl: string;
}

export const googleOidcConfig = registerAs('googleOidc', () => {
  const config = plainToInstance(GoogleOidcConfig, {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_OAUTH_CALLBACK_URL,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
