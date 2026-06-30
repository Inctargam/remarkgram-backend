import { registerAs } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';
import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { configValidationUtility } from '@app/config';

class AuthConfig {
  @IsString()
  @IsNotEmpty()
  declare readonly jwtPrivateKey: string;

  @IsString()
  @IsNotEmpty()
  declare readonly accessTokenExpiresIn: JwtSignOptions['expiresIn'];

  @IsString()
  @IsNotEmpty()
  declare readonly refreshTokenExpiresIn: JwtSignOptions['expiresIn'];

  @IsInt()
  @Min(1)
  @Type(() => Number)
  declare readonly refreshTokenCookieMaxAgeMs: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  declare readonly confirmationCodeExpiresIn: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  declare readonly recoveryCodeExpiresIn: number;
}

export const authConfig = registerAs('auth', () => {
  const config = plainToInstance(AuthConfig, {
    jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
    refreshTokenCookieMaxAgeMs: process.env.REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
    confirmationCodeExpiresIn: process.env.CONFIRMATION_CODE_EXPIRES_IN,
    recoveryCodeExpiresIn: process.env.RECOVERY_CODE_EXPIRES_IN,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
