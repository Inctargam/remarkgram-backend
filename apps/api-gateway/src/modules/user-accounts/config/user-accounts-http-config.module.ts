import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserAccountsHttpConfig } from './user-accounts-http.config.js';

@Module({
  imports: [ConfigModule],
  providers: [UserAccountsHttpConfig],
  exports: [UserAccountsHttpConfig],
})
export class UserAccountsHttpConfigModule {}
