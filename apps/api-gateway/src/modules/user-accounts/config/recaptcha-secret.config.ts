import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { configValidationUtility } from '@app/config';
import { Trim } from '../../../common/http/decorators/trim.decorator.ts';

class RecaptchaSecretConfig {
  @IsString()
  @Trim()
  @IsNotEmpty()
  declare readonly secretKey: string;
}

export const recaptchaSecretConfig = registerAs('recaptchaSecretConfig', () => {
  const config = plainToInstance(RecaptchaSecretConfig, {
    secretKey: process.env.GOOGLE_RECAPTCHA_SECRET_KEY,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
