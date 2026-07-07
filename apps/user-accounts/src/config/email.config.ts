import { registerAs } from '@nestjs/config';
import { plainToInstance, Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { configValidationUtility } from '@app/config';

class EmailCredentials {
  @IsString()
  @IsNotEmpty()
  declare readonly user: string;

  @IsString()
  @IsNotEmpty()
  declare readonly password: string;
}

class EmailConfig {
  @ValidateNested()
  @Type(() => EmailCredentials)
  @IsDefined()
  declare readonly emailCredentials: EmailCredentials;

  @IsString()
  @IsNotEmpty()
  declare readonly smtpUrl: string;
}

export const emailConfig = registerAs('email', () => {
  const config = plainToInstance(EmailConfig, {
    emailCredentials: {
      user: process.env.EMAIL_LOGIN,
      password: process.env.EMAIL_PASSWORD,
    },
    smtpUrl: process.env.SMTP_URL,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
