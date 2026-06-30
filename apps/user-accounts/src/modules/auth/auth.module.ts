import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { authConfig } from '../../config/auth.config.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.jwtPrivateKey,
      }),
    }),
  ],
})
export class AuthModule {}
