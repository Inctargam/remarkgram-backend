import { registerAs } from '@nestjs/config';
import { plainToInstance, Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsInt, IsNotEmpty, IsString, Max, Min, ValidateNested } from 'class-validator';
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
  declare readonly smtpHost: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  declare readonly smtpPort: number;

  @IsBoolean()
  declare readonly smtpSecure: boolean;

  @IsString()
  @IsNotEmpty()
  declare readonly emailFrom: string;
}

export const emailConfig = registerAs('email', () => {
  const emailLogin = process.env.EMAIL_LOGIN;
  const emailFrom = process.env.EMAIL_FROM?.trim() || emailLogin;

  const config = plainToInstance(EmailConfig, {
    emailCredentials: {
      user: emailLogin,
      password: process.env.EMAIL_PASSWORD,
    },
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpSecure:
      process.env.SMTP_SECURE === undefined
        ? undefined
        : configValidationUtility.convertToBoolean(process.env.SMTP_SECURE),
    emailFrom,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
