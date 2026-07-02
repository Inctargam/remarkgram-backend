import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { configValidationUtility } from '@app/config';

@Injectable()
export class UserAccountsHttpConfig {
  @IsString()
  @IsNotEmpty()
  readonly jwtPublicKey: string;

  @IsInt()
  @Min(1)
  readonly refreshTokenCookieMaxAgeMs: number;

  constructor(configService: ConfigService) {
    this.jwtPublicKey = configService.getOrThrow<string>('JWT_PUBLIC_KEY');
    this.refreshTokenCookieMaxAgeMs = configValidationUtility.convertToNumber(
      configService.getOrThrow<string>('REFRESH_TOKEN_COOKIE_MAX_AGE_MS'),
    );
    configValidationUtility.validateConfig(this);
  }
}
