import { registerAs } from '@nestjs/config';
import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { configValidationUtility } from '@app/config';

class PasswordResetConfig {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  declare readonly tokenTtlMinutes: number;

  @IsString()
  @IsNotEmpty()
  declare readonly tokenSecret: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  declare readonly emailCooldownMinutes: number;
}

export const passwordResetConfig = registerAs('passwordReset', () => {
  const config = plainToInstance(PasswordResetConfig, {
    tokenTtlMinutes: process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    tokenSecret: process.env.PASSWORD_RESET_TOKEN_SECRET,
    emailCooldownMinutes: process.env.PASSWORD_RESET_EMAIL_COOLDOWN_MINUTES,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
