import { registerAs } from '@nestjs/config';
import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { configValidationUtility } from '@app/config';

class UserAccountsHttpConfig {
  @IsString()
  @IsNotEmpty()
  declare readonly jwtPublicKey: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  declare readonly refreshTokenCookieMaxAgeMs: number;
}

export const userAccountsHttpConfig = registerAs('userAccountsHttp', () => {
  const config = plainToInstance(UserAccountsHttpConfig, {
    jwtPublicKey: process.env.JWT_PUBLIC_KEY,
    refreshTokenCookieMaxAgeMs: process.env.REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
