import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module.js';
import { DevicesModule } from './modules/devices/devices.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `apps/user-accounts/.env.${process.env.NODE_ENV}.local`,
        `apps/user-accounts/.env.${process.env.NODE_ENV}`,
        `apps/user-accounts/.env.production`,
        'apps/user-accounts/.env',
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        `.env.production`,
        '.env',
      ],
      load: [],
    }),
    AuthModule,
    DevicesModule,
    UsersModule,
  ],
})
export class UserAccountsModule {}
