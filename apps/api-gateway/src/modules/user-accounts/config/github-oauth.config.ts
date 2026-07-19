import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { configValidationUtility } from '@app/config';
import { Trim } from '../../../common/http/decorators/trim.decorator.ts';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

class GithubOauthConfig {
  @Trim()
  @IsString()
  @IsNotEmpty()
  declare readonly clientID: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  declare readonly clientSecret: string;

  @Trim()
  @IsString()
  @IsUrl(
    {
      // 2. Allow 'http' and 'https' in dev, but strictly 'https' in production
      protocols: process.env.NODE_ENV === 'development' ? ['http', 'https'] : ['https'],
      require_protocol: true,
      require_valid_protocol: true,
    },
    {
      message:
        process.env.NODE_ENV === 'development'
          ? 'URL must be a valid http or https link.'
          : 'URL must use a secure https connection.',
    },
  )
  declare readonly callbackURL: string;
}

export const githubOauthConfig = registerAs('githubOauthConfig', () => {
  const config = plainToInstance(GithubOauthConfig, {
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
  });
  configValidationUtility.validateConfig(config);

  return config;
});
